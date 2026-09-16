import { describe, expect, it } from "vitest";
import { assertPlanApprovable, parsePlan } from "./plan-schema";

const basePlan = {
  schemaVersion: 2,
  planId: "safe-plan",
  runId: "run-001",
  objective: "canonical planを導入する",
  assumptions: [],
  openDecisions: [],
  phases: [
    {
      id: "phase-1",
      name: "schema",
      objective: "検証する",
      allowedPaths: ["tools/agent-run/**"],
      qualityGates: ["unit"],
      acceptanceCriteria: ["検証済み"],
      stopConditions: ["不正入力"],
    },
  ],
  allowedPaths: ["tools/agent-run/**"],
  forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
  apiChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "API変更なし",
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
      description: "DB変更なし",
      model: "none",
      migration: "none",
      dataImpact: "none",
      rollback: "none",
    },
  ],
  dependencyChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "依存変更なし",
      name: "none",
      version: "none",
      reason: "none",
      license: "none",
    },
  ],
  permissionChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "権限変更なし",
      target: "none",
      boundary: "none",
      mitigation: "none",
    },
  ],
  secretChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "秘密情報なし",
      target: "none",
      boundary: "none",
      mitigation: "none",
    },
  ],
  externalSideEffects: [
    {
      status: "NOT_APPLICABLE",
      description: "外部副作用なし",
      target: "none",
      boundary: "none",
      mitigation: "none",
    },
  ],
  qualityGates: ["pnpm verify:phase"],
  failurePolicy: "fail closed",
  limits: { maxRetries: 3, maxDurationMinutes: 120, maxCostYen: 0 },
  branch: {
    source: "feature/v3.2.3",
    worktree: ".agent-runs/worktrees/run-001",
    mode: "push_only",
  },
  acceptanceCriteria: ["同じ入力は同じhash"],
};

describe("planSchema", () => {
  it("accepts a complete canonical plan", () =>
    expect(parsePlan(basePlan)).toEqual(basePlan));
  it("rejects legacy schemaVersion 1 without implicit conversion", () =>
    expect(() => parsePlan({ ...basePlan, schemaVersion: 1 })).toThrow());
  it("rejects unsafe and duplicate paths", () => {
    expect(() =>
      parsePlan({ ...basePlan, allowedPaths: ["/tmp", "tools/agent-run/**"] }),
    ).toThrow();
    expect(() =>
      parsePlan({
        ...basePlan,
        allowedPaths: ["tools/agent-run/**", "tools/agent-run/**"],
      }),
    ).toThrow();
    expect(() =>
      parsePlan({ ...basePlan, allowedPaths: ["tools/agent-run\u0000/**"] }),
    ).toThrow();
    expect(() =>
      parsePlan({ ...basePlan, allowedPaths: ["tools//agent-run/**"] }),
    ).toThrow();
    expect(() =>
      parsePlan({ ...basePlan, allowedPaths: [".git/config"] }),
    ).toThrow();
    expect(() =>
      parsePlan({
        ...basePlan,
        phases: [{ ...basePlan.phases[0], allowedPaths: ["apps/**"] }],
      }),
    ).toThrow();
  });
  it("rejects missing mandatory forbidden paths", () => {
    expect(() =>
      parsePlan({ ...basePlan, forbiddenPaths: [".git/**"] }),
    ).toThrow();
  });
  it("separates draft from approval eligibility", () => {
    const draft = parsePlan({ ...basePlan, openDecisions: ["runnerを選ぶ"] });
    expect(() => assertPlanApprovable(draft)).toThrow("openDecisions");
    expect(() => assertPlanApprovable(parsePlan(basePlan))).not.toThrow();
    const rejected = parsePlan({
      ...basePlan,
      apiChanges: [{ ...basePlan.apiChanges[0], status: "REJECTED" }],
    });
    expect(() => assertPlanApprovable(rejected)).toThrow();
  });

  it("accepts empty change lists without inserting dummy records", () => {
    const empty = parsePlan({
      ...basePlan,
      apiChanges: [],
      dbChanges: [],
      dependencyChanges: [],
      permissionChanges: [],
      secretChanges: [],
      externalSideEffects: [],
    });
    expect(empty.apiChanges).toEqual([]);
    expect(empty.dbChanges).toEqual([]);
    expect(empty.dependencyChanges).toEqual([]);
    expect(empty.permissionChanges).toEqual([]);
    expect(empty.secretChanges).toEqual([]);
    expect(empty.externalSideEffects).toEqual([]);
  });
});
