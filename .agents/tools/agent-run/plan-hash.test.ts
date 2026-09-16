import { describe, expect, it } from "vitest";
import { hashPlan, normalizePlan } from "./plan-hash";
import { parsePlan } from "./plan-schema";

const plan = {
  schemaVersion: 2,
  planId: "hash-plan",
  runId: "run-002",
  objective: "hash",
  assumptions: [],
  openDecisions: [],
  phases: [
    {
      id: "phase-1",
      name: "hash",
      objective: "hash",
      allowedPaths: ["tools/**"],
      qualityGates: ["unit"],
      acceptanceCriteria: ["ok"],
      stopConditions: ["fail"],
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
      compatibility: "維持",
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
      status: "NOT_APPLICABLE",
      description: "none",
      target: "none",
      boundary: "none",
      mitigation: "none",
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
      status: "NOT_APPLICABLE",
      description: "none",
      target: "none",
      boundary: "none",
      mitigation: "none",
    },
  ],
  qualityGates: ["unit"],
  failurePolicy: "stop",
  limits: { maxRetries: 3, maxDurationMinutes: 120, maxCostYen: 0 },
  branch: { source: "feature/v3.2.3", worktree: "run", mode: "push_only" },
  acceptanceCriteria: ["ok"],
};

describe("plan hash", () => {
  it("is independent of object property order and ends in LF", () => {
    const parsed = parsePlan(plan);
    const { acceptanceCriteria, ...rest } = plan;
    const reordered = parsePlan({ ...rest, acceptanceCriteria });
    expect(hashPlan(parsed)).toBe(hashPlan(reordered));
    expect(normalizePlan(parsed).endsWith("\n")).toBe(true);
  });
  it("changes when plan meaning changes", () => {
    expect(hashPlan(parsePlan(plan))).not.toBe(
      hashPlan(parsePlan({ ...plan, objective: "changed" })),
    );
  });
});
