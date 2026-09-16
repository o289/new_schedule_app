import { describe, expect, it } from "vitest";
import {
  canonicalActionSchema,
  canonicalSnapshotSchema,
  isPublicationEligible,
  isFinalResponseAllowed,
  resolvePublicationTransition,
  resolvePublicationTransitionForSnapshot,
  resolveCanonicalTransition,
} from "./canonical-orchestration";
const base = {
  state: "DRAFT" as const,
  phaseId: null,
  retryCount: 0,
  publicationState: "NOT_STARTED" as const,
};
const sha = "a".repeat(40);
describe("canonical orchestration", () => {
  it("accepts only the declared canonical actions", () => {
    const actions = [
      "prepare",
      "approve",
      "prepare_workspace",
      "begin_phase",
      "begin_verify",
      "verify_pass",
      "verify_fail",
      "replan",
      "fail",
      "safety_stop",
      "complete",
      "publish",
    ] as const;

    for (const action of actions) {
      expect(canonicalActionSchema.parse(action)).toBe(action);
    }
    expect(() => canonicalActionSchema.parse("run_command")).toThrow();
  });

  it("validates the snapshot strictly", () => {
    expect(canonicalSnapshotSchema.parse(base)).toEqual(base);
    expect(() =>
      canonicalSnapshotSchema.parse({ ...base, unexpected: true }),
    ).toThrow();
    expect(() =>
      canonicalSnapshotSchema.parse({ ...base, retryCount: 4 }),
    ).toThrow();
  });

  it("resolves the happy path and retry limit", () => {
    let s = resolveCanonicalTransition(base, "prepare");
    s = resolveCanonicalTransition(s, "approve");
    s = resolveCanonicalTransition(s, "prepare_workspace");
    s = resolveCanonicalTransition(s, "begin_phase", "phase-1");
    s = resolveCanonicalTransition(s, "begin_verify");
    expect(resolveCanonicalTransition(s, "verify_fail").state).toBe("RUNNING");
    expect(
      resolveCanonicalTransition({ ...s, retryCount: 3 }, "verify_fail").state,
    ).toBe("FAILED");
    expect(resolveCanonicalTransition(s, "verify_pass").state).toBe(
      "COMPLETED",
    );
  });

  it("routes classified verification outcomes to canonical terminal states", () => {
    const verifying = { ...base, state: "VERIFYING" as const };
    expect(
      resolveCanonicalTransition(verifying, "verify_fail", null, "REPLAN")
        .state,
    ).toBe("REPLAN");
    expect(
      resolveCanonicalTransition(verifying, "verify_fail", null, "SAFETY_STOP")
        .state,
    ).toBe("SAFETY_STOP");
    expect(
      resolveCanonicalTransition(verifying, "verify_fail", null, "FAILED")
        .state,
    ).toBe("RUNNING");
  });

  it.each([0, 1, 2])("increments retry count from %s", (retryCount) => {
    const next = resolveCanonicalTransition(
      {
        state: "VERIFYING",
        phaseId: "phase-1",
        retryCount,
        publicationState: "NOT_STARTED",
      },
      "verify_fail",
    );
    expect(next.state).toBe("RUNNING");
    expect(next.retryCount).toBe(retryCount + 1);
  });

  it("moves retry count 3 to FAILED", () => {
    const next = resolveCanonicalTransition(
      {
        state: "VERIFYING",
        phaseId: "phase-1",
        retryCount: 3,
        publicationState: "NOT_STARTED",
      },
      "verify_fail",
    );
    expect(next).toEqual({
      state: "FAILED",
      phaseId: "phase-1",
      retryCount: 3,
      publicationState: "NOT_STARTED",
    });
  });
  it.each(["replan", "fail", "safety_stop"])(
    "resolves %s outcome",
    (action) => {
      const s = resolveCanonicalTransition(base, "prepare");
      expect(resolveCanonicalTransition(s, action).state).toBe(
        action === "replan"
          ? "REPLAN"
          : action === "fail"
            ? "FAILED"
            : "SAFETY_STOP",
      );
    },
  );
  it("rejects unknown actions and terminal progress", () => {
    expect(() => resolveCanonicalTransition(base, "shell")).toThrow();
    expect(() =>
      resolveCanonicalTransition({ ...base, state: "COMPLETED" }, "publish"),
    ).toThrow();
  });
  it("requires every publication safety flag and exact verified SHA", () => {
    const valid = {
      state: "COMPLETED",
      canonicalContextVerified: true,
      planHashValid: true,
      approvalHashValid: true,
      startHashValid: true,
      allPhasesPassed: true,
      targetSha: sha,
      verifiedSha: sha,
      publicationBoundaryRevalidated: true,
      legacyProjection: false,
    };
    expect(isPublicationEligible(valid)).toBe(true);
    for (const key of [
      "canonicalContextVerified",
      "planHashValid",
      "approvalHashValid",
      "startHashValid",
      "allPhasesPassed",
      "publicationBoundaryRevalidated",
    ]) {
      expect(() => isPublicationEligible({ ...valid, [key]: false })).toThrow();
    }
    expect(isPublicationEligible({ ...valid, targetSha: "b".repeat(40) })).toBe(
      false,
    );
    expect(() =>
      isPublicationEligible({ ...valid, legacyProjection: true }),
    ).toThrow();
  });

  it("allows only the declared publication transitions", () => {
    expect(resolvePublicationTransition("NOT_STARTED", "PENDING")).toBe(
      "PENDING",
    );
    expect(resolvePublicationTransition("PENDING", "BRANCH_PUSHED")).toBe(
      "BRANCH_PUSHED",
    );
    expect(resolvePublicationTransition("BRANCH_PUSHED", "CI_PASSED")).toBe(
      "CI_PASSED",
    );
    expect(resolvePublicationTransition("CI_PASSED", "PR_CREATED")).toBe(
      "PR_CREATED",
    );
    expect(() =>
      resolvePublicationTransition("PR_CREATED", "BLOCKED"),
    ).toThrow();
    expect(() =>
      resolvePublicationTransition("NOT_STARTED", "PR_CREATED"),
    ).toThrow();
  });

  it("requires CI for push-only final responses", () => {
    const common = {
      mode: "push_only" as const,
      implementationState: "COMPLETED" as const,
      targetSha: sha,
      verifiedSha: sha,
      head: "feature/v3.2.3",
    };
    expect(
      isFinalResponseAllowed({ ...common, publicationState: "CI_PASSED" }),
    ).toBe(true);
    expect(
      isFinalResponseAllowed({ ...common, publicationState: "BRANCH_PUSHED" }),
    ).toBe(false);
    expect(
      isFinalResponseAllowed({
        ...common,
        implementationState: "VERIFYING",
        publicationState: "CI_PASSED",
      }),
    ).toBe(false);
  });

  it("requires an exact normal PR for pull-request final responses", () => {
    const common = {
      mode: "pull_request" as const,
      implementationState: "COMPLETED" as const,
      publicationState: "PR_CREATED" as const,
      targetSha: sha,
      verifiedSha: sha,
      head: "feature/task-v3.2.3",
      base: "feature/v3.2.3",
      prUrl: "https://github.com/o289/new_schedule_app/pull/1",
      prState: "OPEN" as const,
      isDraft: false as const,
    };
    expect(
      isFinalResponseAllowed({
        ...common,
        prHead: common.head,
        prBase: common.base,
        prSha: sha,
      }),
    ).toBe(true);
    expect(
      isFinalResponseAllowed({
        ...common,
        prHead: common.head,
        prBase: "main",
        prSha: sha,
      }),
    ).toBe(false);
    expect(
      isFinalResponseAllowed({
        ...common,
        prHead: common.head,
        prBase: common.base,
        prSha: sha,
        prState: "CLOSED",
      }),
    ).toBe(false);
    expect(
      isFinalResponseAllowed({
        ...common,
        prHead: common.head,
        prBase: common.base,
        prSha: sha,
        isDraft: true,
      }),
    ).toBe(false);
    expect(
      isFinalResponseAllowed({ ...common, publicationState: "CI_PASSED" }),
    ).toBe(false);
  });

  it("does not start publication before implementation is complete", () => {
    expect(() =>
      resolvePublicationTransitionForSnapshot(
        { implementationState: "VERIFYING", publicationState: "NOT_STARTED" },
        "PENDING",
      ),
    ).toThrow();
    expect(
      resolvePublicationTransitionForSnapshot(
        { implementationState: "COMPLETED", publicationState: "NOT_STARTED" },
        "PENDING",
      ),
    ).toBe("PENDING");
  });
});
