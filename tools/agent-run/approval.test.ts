import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApproval, validateApproval } from "./approval";
import { hashPlan } from "./plan-hash";
import { parsePlan } from "./plan-schema";

const plan = {
  schemaVersion: 2,
  planId: "approval-plan",
  runId: "approval-run",
  objective: "test",
  assumptions: [],
  openDecisions: [],
  phases: [
    {
      id: "phase-1",
      name: "test",
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
const content = JSON.stringify(plan);
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const input = {
  schemaVersion: 2 as const,
  runId: plan.runId,
  plan: { path: "plan.json", sha256: digest(content) },
  planHash: hashPlan(parsePlan(plan)),
  approvedBy: "owner",
  approvedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2026-01-03T00:00:00Z",
};

describe("approval", () => {
  it("rejects legacy schemaVersion 1 without implicit conversion", async () => {
    await expect(
      createApproval(
        { ...input, schemaVersion: 1 },
        { read: async () => content, writeExclusive: async () => undefined },
        new Date("2026-01-02T00:00:00Z"),
      ),
    ).rejects.toThrow();
  });
  it("creates a valid record and rejects exclusive second write", async () => {
    const writes: string[] = [];
    const io = {
      read: async () => content,
      writeExclusive: async (_path: string, value: string) => {
        if (writes.length) throw new Error("EEXIST");
        writes.push(value);
      },
    };
    const record = await createApproval(
      input,
      io,
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(record.completed).toBe(true);
    await expect(
      createApproval(input, io, new Date("2026-01-02T00:00:00Z")),
    ).rejects.toThrow("EEXIST");
  });
  it.each([
    "planHash",
    "runId",
    "planFile",
    "openDecisions",
    "rejected",
    "order",
    "sevenDays",
    "expired",
  ])("rejects %s", (problem) => {
    let candidate = { ...input };
    let candidateContent = content;
    if (problem === "planHash")
      candidate = { ...candidate, planHash: "0".repeat(64) };
    if (problem === "runId") candidate = { ...candidate, runId: "other" };
    if (problem === "planFile")
      candidate = {
        ...candidate,
        plan: { ...candidate.plan, sha256: "0".repeat(64) },
      };
    if (problem === "openDecisions")
      candidateContent = JSON.stringify({ ...plan, openDecisions: ["decide"] });
    if (problem === "rejected")
      candidateContent = JSON.stringify({
        ...plan,
        apiChanges: [{ ...plan.apiChanges[0], status: "REJECTED" }],
      });
    if (problem === "order")
      candidate = {
        ...candidate,
        approvedAt: candidate.expiresAt,
        planHash: input.planHash,
      };
    if (problem === "sevenDays")
      candidate = { ...candidate, expiresAt: "2026-01-09T00:00:01Z" };
    if (problem === "expired")
      candidate = { ...candidate, expiresAt: "2026-01-01T00:00:01Z" };
    expect(() =>
      validateApproval(
        candidate,
        candidateContent,
        new Date("2026-01-02T00:00:00Z"),
      ),
    ).toThrow();
  });
});
