import { describe, expect, it } from "vitest";
import { evaluateFinalStatus, executeStatus } from "./run-command";

const sha = "a".repeat(40);
const base = {
  mode: "pull_request" as const,
  implementationState: "COMPLETED" as const,
  publicationState: "PR_CREATED" as const,
  targetSha: sha,
  verifiedSha: sha,
  head: "feature/task-v3.2.3",
  base: "feature/v3.2.3",
  prHead: "feature/task-v3.2.3",
  prBase: "feature/v3.2.3",
  prSha: sha,
  prUrl: "https://github.com/o289/new_schedule_app/pull/1",
  prState: "OPEN" as const,
  isDraft: false,
};

describe("publication status final gate", () => {
  it("executeStatus accepts a valid push-only run fixture", () => {
    const plan = {
      schemaVersion: 2,
      planId: "status",
      runId: "status-run",
      objective: "x",
      assumptions: [],
      openDecisions: [],
      phases: [
        {
          id: "phase-1",
          name: "x",
          objective: "x",
          allowedPaths: ["x"],
          qualityGates: ["x"],
          acceptanceCriteria: ["x"],
          stopConditions: ["x"],
        },
      ],
      allowedPaths: ["x"],
      forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      apiChanges: [],
      dbChanges: [],
      dependencyChanges: [],
      permissionChanges: [],
      secretChanges: [],
      externalSideEffects: [],
      qualityGates: ["x"],
      failurePolicy: "stop",
      limits: { maxRetries: 3, maxDurationMinutes: 1, maxCostYen: 0 },
      branch: { source: "feature/v3.2.3", worktree: "run", mode: "push_only" },
      acceptanceCriteria: ["x"],
    } as unknown;
    const start = {
      schemaVersion: 2,
      approved: true,
      assessment: {
        phaseCount: 1,
        plannedFiles: ["x"],
        authenticationChanged: false,
        dbModels: [],
        dependentDbModels: false,
        directImplementation: false,
      },
      size: "medium",
      mode: "push_only",
      sourceBranch: "feature/v3.2.3",
      head: "feature/v3.2.3",
      reviewBaseSha: "a".repeat(40),
      plan: {
        path: "ai/runs/status-run/plan.json",
        runId: "status-run",
        planHash: "a".repeat(64),
        sha256: "a".repeat(64),
      },
      approval: {
        path: "ai/runs/status-run/approval.json",
        runId: "status-run",
        planHash: "a".repeat(64),
        sha256: "a".repeat(64),
      },
      implementation: {
        path: "ai/runs/status-run/agent-plan.md",
        sha256: "a".repeat(64),
      },
      completed: true,
    } as unknown;
    const summary = executeStatus("status-run", {
      plan,
      approval: { expiresAt: "2999-01-01T00:00:00.000Z" },
      start,
      handoff: {},
      currentHead: sha,
      snapshot: {
        state: "COMPLETED",
        phaseId: "phase-1",
        retryCount: 0,
        publicationState: "CI_PASSED",
        evidenceByPhase: {
          "phase-1": {
            phaseId: "phase-1",
            evidenceHash: "b".repeat(64),
            verifiedSha: sha,
            gatesPassed: true,
          },
        },
        passedPhaseIds: ["phase-1"],
        publicationEvidenceByState: {
          CI_PASSED: {
            kind: "CI_PASSED",
            pushedSha: sha,
            ciUrl: "https://github.com/o289/new_schedule_app/actions/runs/1",
          },
        },
      } as unknown as never,
      validateContext: () => undefined,
    });
    expect(summary.final).toBe(true);
  });

  it("executeStatus accepts a valid pull-request fixture", () => {
    const plan = {
      schemaVersion: 2,
      planId: "status",
      runId: "status-pr",
      objective: "x",
      assumptions: [],
      openDecisions: [],
      phases: [
        {
          id: "phase-1",
          name: "x",
          objective: "x",
          allowedPaths: ["x"],
          qualityGates: ["x"],
          acceptanceCriteria: ["x"],
          stopConditions: ["x"],
        },
      ],
      allowedPaths: ["x"],
      forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      apiChanges: [],
      dbChanges: [],
      dependencyChanges: [],
      permissionChanges: [],
      secretChanges: [],
      externalSideEffects: [],
      qualityGates: ["x"],
      failurePolicy: "stop",
      limits: { maxRetries: 3, maxDurationMinutes: 1, maxCostYen: 0 },
      branch: {
        source: "feature/v3.2.3",
        worktree: "run",
        mode: "pull_request",
      },
      acceptanceCriteria: ["x"],
    } as unknown;
    const start = {
      schemaVersion: 2,
      approved: true,
      assessment: {
        phaseCount: 5,
        plannedFiles: ["x"],
        authenticationChanged: false,
        dbModels: [],
        dependentDbModels: false,
        directImplementation: false,
      },
      size: "large",
      mode: "pull_request",
      sourceBranch: "feature/v3.2.3",
      head: "feature/status-pr-v3.2.3",
      slug: "status-pr",
      reviewBaseSha: "a".repeat(40),
      plan: {
        path: "ai/runs/status-pr/plan.json",
        runId: "status-pr",
        planHash: "a".repeat(64),
        sha256: "a".repeat(64),
      },
      approval: {
        path: "ai/runs/status-pr/approval.json",
        runId: "status-pr",
        planHash: "a".repeat(64),
        sha256: "a".repeat(64),
      },
      implementation: {
        path: "ai/runs/status-pr/agent-plan.md",
        sha256: "a".repeat(64),
      },
      completed: true,
    } as unknown;
    const summary = executeStatus("status-pr", {
      plan,
      approval: { expiresAt: "2999-01-01T00:00:00.000Z" },
      start,
      handoff: {},
      currentHead: sha,
      snapshot: {
        state: "COMPLETED",
        phaseId: "phase-1",
        retryCount: 0,
        publicationState: "PR_CREATED",
        evidenceByPhase: {
          "phase-1": {
            phaseId: "phase-1",
            evidenceHash: "b".repeat(64),
            verifiedSha: sha,
            gatesPassed: true,
          },
        },
        passedPhaseIds: ["phase-1"],
        publicationEvidenceByState: {
          CI_PASSED: {
            kind: "CI_PASSED",
            pushedSha: sha,
            ciUrl: "https://github.com/o289/new_schedule_app/actions/runs/1",
          },
          PR_CREATED: {
            kind: "PR_CREATED",
            url: "https://github.com/o289/new_schedule_app/pull/1",
            head: "feature/status-pr-v3.2.3",
            base: "feature/v3.2.3",
            headSha: sha,
            state: "OPEN",
            isDraft: false,
          },
        },
      } as unknown as never,
      validateContext: () => undefined,
    });
    expect(summary.final).toBe(true);
  });
  it("accepts exact pull request and push-only completion", () => {
    expect(evaluateFinalStatus(base)).toBe(true);
    expect(
      evaluateFinalStatus({
        mode: "push_only",
        implementationState: "COMPLETED",
        publicationState: "CI_PASSED",
        targetSha: sha,
        verifiedSha: sha,
        head: "feature/v3.2.3",
      }),
    ).toBe(true);
  });

  it.each([
    ["missing PR metadata", { prUrl: undefined }],
    ["wrong PR head", { prHead: "feature/other-v3.2.3" }],
    ["wrong PR base", { prBase: "main" }],
    ["wrong PR SHA", { prSha: "b".repeat(40) }],
    ["closed PR", { prState: "CLOSED" }],
    ["draft PR", { isDraft: true }],
    ["wrong URL host", { prUrl: "https://example.com/pull/1" }],
    ["missing CI evidence", { publicationState: "CI_PASSED" }],
    ["HEAD mismatch", { targetSha: "b".repeat(40) }],
    ["incomplete implementation", { implementationState: "VERIFYING" }],
    ["pending", { publicationState: "PENDING" }],
    ["blocked", { publicationState: "BLOCKED" }],
  ])("rejects %s", (_, change) => {
    expect(evaluateFinalStatus({ ...base, ...change })).toBe(false);
  });

  it("rejects extra untyped fields", () => {
    expect(
      evaluateFinalStatus({ ...base, canonicalContextVerified: true }),
    ).toBe(false);
  });
});
