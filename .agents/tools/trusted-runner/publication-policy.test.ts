import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPlan } from "../agent-run/plan-hash.js";
import { parsePlan } from "../agent-run/plan-schema.js";
import {
  parseTrustedRunnerRequest,
  type PublicationRequest,
} from "./protocol.js";
import {
  validatePublicationIntent,
  type PublicationEvidence,
} from "./publication-policy.js";

const targetSha = "f".repeat(40);
const startSha = "a".repeat(40);
const now = new Date("2026-01-02T00:00:00Z");

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function makePlan(mode: "push_only" | "pull_request") {
  return parsePlan({
    schemaVersion: 2,
    planId: "publication-plan",
    runId: "publication-run",
    objective: "publication policy test",
    assumptions: [],
    openDecisions: [],
    phases: [
      {
        id: "phase-1",
        name: "policy",
        objective: "test",
        allowedPaths: ["tools/**"],
        qualityGates: ["unit"],
        acceptanceCriteria: ["ok"],
        stopConditions: ["stop"],
      },
    ],
    allowedPaths: ["tools/**"],
    forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
    apiChanges: [
      {
        status: "NOT_APPLICABLE",
        description: "none",
        method: "none",
        path: "none",
        request: "none",
        response: "none",
        compatibility: "none",
      },
    ],
    dbChanges: [
      {
        status: "NOT_APPLICABLE",
        description: "none",
        model: "none",
        migration: "none",
        dataImpact: "none",
        rollback: "none",
      },
    ],
    dependencyChanges: [
      {
        status: "NOT_APPLICABLE",
        description: "none",
        name: "none",
        version: "none",
        reason: "none",
        license: "none",
      },
    ],
    permissionChanges: [
      {
        status: "APPROVED",
        description: "publish",
        target: "runner",
        boundary: "test",
        mitigation: "test",
      },
    ],
    secretChanges: [
      {
        status: "NOT_APPLICABLE",
        description: "none",
        target: "none",
        boundary: "none",
        mitigation: "none",
      },
    ],
    externalSideEffects: [
      {
        status: "APPROVED",
        description: "publish",
        target: "origin",
        boundary: "test",
        mitigation: "test",
      },
    ],
    qualityGates: ["unit"],
    failurePolicy: "stop",
    limits: { maxRetries: 3, maxDurationMinutes: 120, maxCostYen: 0 },
    branch: {
      source: "feature/v3.2.3",
      worktree: ".agent-runs/worktrees/publication-run",
      mode,
    },
    acceptanceCriteria: ["ok"],
  });
}

function handoffFor(input: {
  mode: "push_only" | "pull_request";
  head: string;
  startRecord: string;
  plan: string;
}) {
  const common = {
    schemaVersion: 2,
    head: input.head,
    headSha: targetSha,
    reviewBaseSha: startSha,
    start: {
      path: "docs/pr-agent-start-record.json",
      sha256: digest(input.startRecord),
    },
    plan: {
      path: "docs/agent-runs/publication-run/plan.json",
      sha256: digest(input.plan),
    },
    implementation: { path: "docs/implementation.md", sha256: "b".repeat(64) },
    allPhasesComplete: true,
    quality: {
      final: "PASS",
      verifyPhase: {
        status: "PASS",
        evidence: { path: "docs/quality.md", sha256: "c".repeat(64) },
      },
      integration: { status: "NOT_REQUIRED", reason: "none" },
      e2e: { status: "NOT_REQUIRED", reason: "none" },
    },
    changes: {
      db: false,
      dependencies: false,
      configuration: false,
      generated: false,
    },
    review: {
      diffSha256: "d".repeat(64),
      classification: {
        path: "docs/classification.md",
        sha256: "e".repeat(64),
      },
      allDiffClassified: true,
      unclassified: 0,
      safetyReview: { path: "docs/safety.md", sha256: "1".repeat(64) },
      noSecretsOrDebug: true,
      noUnapprovedChanges: true,
      destructiveMigrationApproved: true,
      html: { path: "docs/review.html", sha256: "2".repeat(64) },
    },
  } as const;
  if (input.mode === "push_only") return common;
  return {
    ...common,
    mode: "pull_request" as const,
    baseSha: startSha,
    prReview: {
      diffSha256: "3".repeat(64),
      classification: {
        path: "docs/pr-classification.md",
        sha256: "4".repeat(64),
      },
      allDiffClassified: true,
      unclassified: 0,
    },
    title: "Publication test",
    body: { path: "docs/pr-body.md", sha256: "5".repeat(64) },
  };
}

function publicationRequest(evidence: PublicationEvidence): PublicationRequest {
  const planHash = hashPlan(parsePlan(JSON.parse(evidence.plan) as unknown));
  const request = parseTrustedRunnerRequest(
    JSON.stringify({
      protocolVersion: "1",
      runId: "publication-run",
      planHash,
      revision: evidence.revision,
      nonce: "a".repeat(32),
      capability: "publish_approved_sha",
      args: {
        targetSha,
        canonicalContext: {
          startRecordSha256: digest(evidence.startRecord),
          approvalSha256: digest(evidence.approval),
          handoffSha256: digest(evidence.handoff),
          headSha: targetSha,
        },
      },
    }),
  );
  if (request.capability !== "publish_approved_sha") {
    throw new Error("publication request fixture is invalid");
  }
  return request;
}

function evidenceFor(
  mode: "push_only" | "pull_request",
  legacyStart = false,
): PublicationEvidence {
  const plan = makePlan(mode);
  const planText = JSON.stringify(plan);
  const planHash = hashPlan(plan);
  const head =
    mode === "push_only" ? "feature/v3.2.3" : "feature/publication-v3.2.3";
  const assessment =
    mode === "push_only"
      ? {
          phaseCount: 1,
          plannedFiles: ["tools/trusted-runner/protocol.ts"],
          authenticationChanged: false,
          dbModels: [],
          dependentDbModels: false,
          directImplementation: false,
        }
      : {
          phaseCount: 5,
          plannedFiles: ["tools/trusted-runner/protocol.ts"],
          authenticationChanged: false,
          dbModels: [],
          dependentDbModels: false,
          directImplementation: false,
        };
  const approvalText = JSON.stringify({
    schemaVersion: 2,
    runId: "publication-run",
    plan: {
      path: "docs/agent-runs/publication-run/plan.json",
      sha256: digest(planText),
    },
    planHash,
    approvedBy: "owner",
    approvedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-03T00:00:00Z",
    completed: true,
  });
  const startBase = {
    approved: true,
    assessment,
    size: mode === "push_only" ? "medium" : "large",
    mode,
    sourceBranch: "feature/v3.2.3",
    head,
    reviewBaseSha: startSha,
    plan: {
      path: "docs/agent-runs/publication-run/plan.json",
      sha256: digest(planText),
      runId: "publication-run",
      planHash,
    },
  };
  const startRecord = legacyStart
    ? {
        ...startBase,
        schemaVersion: 1,
        ...(mode === "pull_request" ? { slug: "publication" } : {}),
        plan: {
          path: startBase.plan.path,
          sha256: startBase.plan.sha256,
        },
        completed: true,
      }
    : {
        ...startBase,
        schemaVersion: 2,
        ...(mode === "pull_request" ? { slug: "publication" } : {}),
        approval: {
          path: "docs/agent-runs/publication-run/approval.json",
          sha256: digest(approvalText),
          runId: "publication-run",
          planHash,
        },
        implementation: {
          path: "docs/agent-runs/publication-run/agent-plan.md",
          sha256: "6".repeat(64),
        },
        completed: true,
      };
  const startText = JSON.stringify(startRecord);
  const handoff = handoffFor({
    mode,
    head,
    startRecord: startText,
    plan: planText,
  });
  return {
    startRecord: startText,
    plan: planText,
    approval: approvalText,
    handoff: JSON.stringify({ ...handoff, mode }),
    revision: 7,
  };
}

describe("publication policy", () => {
  it("validates v2 start, plan, approval, handoff, revision, and HEAD hashes", () => {
    const evidence = evidenceFor("push_only");
    expect(
      validatePublicationIntent(publicationRequest(evidence), evidence, now),
    ).toEqual(
      expect.objectContaining({
        branch: "feature/v3.2.3",
        mode: "push_only",
        targetSha,
      }),
    );
  });

  it("derives the pull request branch and base exclusively from the start record", () => {
    const evidence = evidenceFor("pull_request");
    const request = publicationRequest(evidence);
    expect(validatePublicationIntent(request, evidence, now)).toMatchObject({
      branch: "feature/publication-v3.2.3",
      base: "feature/v3.2.3",
      mode: "pull_request",
    });
  });

  it("keeps completed v1 start records readable, while canonical plan and approval stay v2", () => {
    const evidence = evidenceFor("push_only", true);
    expect(
      validatePublicationIntent(publicationRequest(evidence), evidence, now),
    ).toMatchObject({
      mode: "push_only",
    });
  });

  it.each([
    [
      "start",
      (evidence: PublicationEvidence) => ({ ...evidence, startRecord: "{}" }),
    ],
    [
      "approval",
      (evidence: PublicationEvidence) => ({ ...evidence, approval: "{}" }),
    ],
    [
      "handoff",
      (evidence: PublicationEvidence) => ({ ...evidence, handoff: "{}" }),
    ],
    [
      "revision",
      (evidence: PublicationEvidence) => ({ ...evidence, revision: 8 }),
    ],
  ])("rejects a mismatched %s reference", (_name, change) => {
    const evidence = evidenceFor("push_only");
    expect(() =>
      validatePublicationIntent(
        publicationRequest(evidence),
        change(evidence),
        now,
      ),
    ).toThrow();
  });

  it("rejects a target SHA that differs from canonical HEAD", () => {
    const evidence = evidenceFor("push_only");
    const request = publicationRequest(evidence);
    const invalid = {
      ...request,
      args: {
        ...request.args,
        targetSha: "0".repeat(40),
      },
    };
    expect(() => validatePublicationIntent(invalid, evidence, now)).toThrow();
  });

  it("rejects new v1 plan or approval documents", () => {
    const evidence = evidenceFor("push_only");
    const legacyPlan = JSON.stringify({
      ...JSON.parse(evidence.plan),
      schemaVersion: 1,
    });
    expect(() =>
      validatePublicationIntent(
        publicationRequest(evidence),
        { ...evidence, plan: legacyPlan },
        now,
      ),
    ).toThrow();
    const legacyApproval = JSON.stringify({
      ...JSON.parse(evidence.approval),
      schemaVersion: 1,
    });
    expect(() =>
      validatePublicationIntent(
        publicationRequest(evidence),
        { ...evidence, approval: legacyApproval },
        now,
      ),
    ).toThrow();
  });
});
