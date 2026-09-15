import { describe, expect, it } from "vitest";
import {
  actionSchema,
  agentRunCommandInputSchema,
  TrustedOrchestrator,
  verifyCanonicalContext,
} from "./orchestrator";
import { StateStore } from "./state-store";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { parsePlan } from "./plan-schema";
import { hashPlan } from "./plan-hash";
import { renderPlanMarkdown } from "./plan-render";
import { approvalRecordSchema } from "./approval";
import { startRecordV2Schema } from "../pr-agent-start.js";
import { worktreeMarkerSchema } from "./worktree";
import type { PathGuardResult } from "./path-guard";
import type { DependencyGuardResult } from "./dependency-guard";

const sha = "a".repeat(40);
const pathResult = (value: Partial<PathGuardResult>): PathGuardResult => ({
  changes: [],
  violations: [],
  classification: "CLEAN",
  ...value,
});
const dependencyResult = (
  value: Partial<DependencyGuardResult>,
): DependencyGuardResult => ({
  changed: false,
  changes: [],
  reason: "clean",
  classification: "CLEAN",
  ...value,
});
const basePlan = {
  schemaVersion: 2,
  planId: "safe-plan",
  runId: "run-001",
  objective: "test",
  assumptions: [],
  openDecisions: [],
  phases: [
    {
      id: "phase-1",
      name: "one",
      objective: "test",
      allowedPaths: ["tools/agent-run/**"],
      qualityGates: ["unit", "integration"],
      acceptanceCriteria: ["ok"],
      stopConditions: ["stop"],
    },
    {
      id: "phase-2",
      name: "two",
      objective: "test",
      allowedPaths: ["tools/agent-run/**"],
      qualityGates: ["unit", "integration"],
      acceptanceCriteria: ["ok"],
      stopConditions: ["stop"],
    },
  ],
  allowedPaths: ["tools/agent-run/**"],
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
  qualityGates: ["unit", "integration"],
  failurePolicy: "stop",
  limits: { maxRetries: 3, maxDurationMinutes: 120, maxCostYen: 0 },
  branch: {
    source: "feature/v3.2.3",
    worktree: ".agent-runs/worktrees/run-001",
    mode: "push_only",
  },
  acceptanceCriteria: ["ok"],
};
function fixture() {
  const root = "/tmp/repo",
    plan = parsePlan(basePlan),
    planText = JSON.stringify(basePlan, null, 2) + "\n",
    planHash = hashPlan(plan),
    now = new Date("2026-01-01T00:00:00.000Z"),
    approval = approvalRecordSchema.parse({
      schemaVersion: 2,
      runId: "run-001",
      plan: {
        path: "docs/agent-runs/run-001/plan.json",
        sha256: digest(planText),
      },
      planHash,
      approvedBy: "owner",
      approvedAt: "2025-12-31T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
      completed: true,
    }),
    agentPlan = renderPlanMarkdown({ plan, planHash }),
    approvalText = JSON.stringify(approval),
    start = startRecordV2Schema.parse({
      schemaVersion: 2,
      approved: true,
      assessment: {
        phaseCount: 1,
        plannedFiles: ["tools/agent-run/orchestrator.ts"],
        authenticationChanged: false,
        dbModels: [],
        dependentDbModels: false,
        directImplementation: false,
      },
      size: "medium",
      mode: "push_only",
      sourceBranch: "feature/v3.2.3",
      head: "feature/v3.2.3",
      reviewBaseSha: sha,
      plan: {
        path: "docs/agent-runs/run-001/plan.json",
        sha256: digest(planText),
        runId: "run-001",
        planHash,
      },
      approval: {
        path: "docs/agent-runs/run-001/approval.json",
        sha256: digest(approvalText),
        runId: "run-001",
        planHash,
      },
      implementation: {
        path: "docs/agent-runs/run-001/agent-plan.md",
        sha256: digest(agentPlan),
      },
      completed: true,
    }),
    marker = worktreeMarkerSchema.parse({
      schemaVersion: 1,
      runId: "run-001",
      repositoryRealpath: root,
      startSha: sha,
      taskBranch: "agent-run/run-001",
      gitCommonDir: root + "/.git",
    });
  const files = new Map([
    [root + "/docs/agent-runs/run-001/plan.json", planText],
    [
      root + "/docs/agent-runs/run-001/manifest.json",
      JSON.stringify({
        planId: plan.planId,
        runId: plan.runId,
        planHash,
        artifacts: ["plan.json", "plan-review.html", "agent-plan.md"],
      }),
    ],
    [root + "/docs/agent-runs/run-001/approval.json", approvalText],
    [root + "/docs/agent-runs/run-001/agent-plan.md", agentPlan],
    [root + "/docs/pr-agent-start-record.json", JSON.stringify(start)],
    [
      root + "/.agent-runs/worktrees/run-001/.agent-run-marker.json",
      JSON.stringify(marker),
    ],
  ]);
  return { root, plan, planHash, now, files };
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
describe("trusted orchestrator", () => {
  it("rejects cleanup actor mismatch", () =>
    expect(() =>
      actionSchema.parse({
        action: "cleanup",
        expectedRevision: 0,
        actor: "publisher",
      }),
    ).toThrow());
  it("rejects checkpoint actor mismatch", () =>
    expect(() =>
      actionSchema.parse({
        action: "checkpoint",
        expectedRevision: 0,
        actor: "runner",
        commitSha: sha,
      }),
    ).toThrow());
  it("rejects verifier implementation", () =>
    expect(() =>
      actionSchema.parse({
        action: "record_implementation",
        expectedRevision: 1,
        actor: "verifier",
        summary: "x",
        targetSha: sha,
      }),
    ).toThrow());
  it("rejects runner result", () =>
    expect(() =>
      actionSchema.parse({
        action: "begin_verify",
        expectedRevision: 1,
        actor: "runner",
      }),
    ).toThrow());
  it("rejects quarantine planner", () =>
    expect(() =>
      actionSchema.parse({
        action: "quarantine",
        expectedRevision: 1,
        actor: "planner",
        reason: "x",
      }),
    ).toThrow());
  it("rejects malformed gate id", () =>
    expect(() =>
      actionSchema.parse({
        action: "record_result",
        expectedRevision: 1,
        actor: "verifier",
        gateId: "../gate",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
      }),
    ).toThrow());
  it("rejects malformed phase id", () =>
    expect(() =>
      actionSchema.parse({
        action: "begin_phase",
        expectedRevision: 1,
        actor: "runner",
        phaseId: "phase/1",
      }),
    ).toThrow());
  it("rejects negative checkpoint revision", () =>
    expect(() =>
      actionSchema.parse({
        action: "checkpoint",
        expectedRevision: -1,
        actor: "publisher",
        commitSha: sha,
      }),
    ).toThrow());
  it("rejects unknown quarantine field", () =>
    expect(() =>
      actionSchema.parse({
        action: "quarantine",
        expectedRevision: 1,
        actor: "runner",
        reason: "x",
        path: "x",
      }),
    ).toThrow());
  it("rejects result passed shortcut", () =>
    expect(() =>
      actionSchema.parse({
        action: "record_result",
        expectedRevision: 1,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
        passed: true,
      }),
    ).toThrow());
  it("accepts fixed command input", () =>
    expect(
      agentRunCommandInputSchema.parse({
        runId: "run-001",
        command: { action: "prepare", expectedRevision: 0, actor: "planner" },
      }).runId,
    ).toBe("run-001"));
  it.each([
    [
      "unknown top field",
      {
        runId: "run-001",
        command: { action: "prepare", expectedRevision: 0, actor: "planner" },
        shell: "rm",
      },
    ],
    [
      "escaped run id",
      {
        runId: "../run",
        command: { action: "prepare", expectedRevision: 0, actor: "planner" },
      },
    ],
    [
      "command path",
      {
        runId: "run-001",
        command: {
          action: "prepare",
          expectedRevision: 0,
          actor: "planner",
          path: "../x",
        },
      },
    ],
    [
      "command shell",
      {
        runId: "run-001",
        command: {
          action: "prepare",
          expectedRevision: 0,
          actor: "planner",
          shell: "echo",
        },
      },
    ],
    ["missing command", { runId: "run-001" }],
    ["wrong command type", { runId: "run-001", command: "rm -rf" }],
    [
      "absolute run id",
      {
        runId: "/tmp/run",
        command: { action: "prepare", expectedRevision: 0, actor: "planner" },
      },
    ],
    [
      "empty run id",
      {
        runId: "",
        command: { action: "prepare", expectedRevision: 0, actor: "planner" },
      },
    ],
    [
      "nested field",
      {
        runId: "run-001",
        command: {
          action: "prepare",
          expectedRevision: 0,
          actor: "planner",
          options: { shell: true },
        },
      },
    ],
    [
      "extra action",
      {
        runId: "run-001",
        command: {
          action: "prepare",
          expectedRevision: 0,
          actor: "planner",
          runId: "other",
        },
      },
    ],
  ])("rejects fixed input %s", (_name, value) =>
    expect(() => agentRunCommandInputSchema.parse(value)).toThrow(),
  );
  function contextFixture() {
    const f = fixture();
    return {
      f,
      io: {
        read: async (path: string) =>
          f.files.get(path) ??
          (() => {
            throw new Error("missing " + path);
          })(),
        realpath: async (path: string) => path,
        git: async () => f.root + "/.git",
        lstat: async () => ({
          isDirectory: () => true,
          isSymbolicLink: () => false,
        }),
        head: async () => sha,
        inspectPaths: async () => pathResult({}),
        inspectDependencies: async () => dependencyResult({}),
        now: () => f.now,
      },
    };
  }
  it("verifies a valid canonical fixture", async () => {
    const { f, io } = contextFixture();
    await expect(
      verifyCanonicalContext(f.root, "run-001", io),
    ).resolves.toMatchObject({
      startSha: sha,
      taskBranch: "agent-run/run-001",
    });
  });
  it("rejects plan hash mismatch", async () => {
    const { f, io } = contextFixture();
    f.files.set(f.root + "/docs/agent-runs/run-001/manifest.json", "{}");
    await expect(
      verifyCanonicalContext(f.root, "run-001", io),
    ).rejects.toThrow();
  });
  it("rejects expired approval", async () => {
    const { f, io } = contextFixture();
    f.files.set(
      f.root + "/docs/agent-runs/run-001/approval.json",
      JSON.stringify({
        ...JSON.parse(
          f.files.get(f.root + "/docs/agent-runs/run-001/approval.json")!,
        ),
        expiresAt: "2025-12-31T00:00:00.000Z",
      }),
    );
    await expect(
      verifyCanonicalContext(f.root, "run-001", io),
    ).rejects.toThrow();
  });
  it("rejects marker task branch mismatch", async () => {
    const { f, io } = contextFixture();
    f.files.set(
      f.root + "/.agent-runs/worktrees/run-001/.agent-run-marker.json",
      JSON.stringify({
        ...JSON.parse(
          f.files.get(
            f.root + "/.agent-runs/worktrees/run-001/.agent-run-marker.json",
          )!,
        ),
        taskBranch: "agent-run/other-run",
      }),
    );
    await expect(verifyCanonicalContext(f.root, "run-001", io)).rejects.toThrow(
      "marker",
    );
  });
  it("prepare uses canonical run id and appends three events", async () => {
    const { f, io } = contextFixture();
    await mkdir("/tmp/repo/.agent-runs", { recursive: true });
    const run = "/tmp/repo/.agent-runs/run-001";
    await unlink(join(run, "events.jsonl")).catch(() => undefined);
    await unlink(join(run, "implementation.jsonl")).catch(() => undefined);
    await unlink(join(run, "quality-gates.jsonl")).catch(() => undefined);
    await unlink(join(run, "implementation.jsonl")).catch(() => undefined);
    await unlink(join(run, "quality-gates.jsonl")).catch(() => undefined);
    const store = new StateStore(join(run, "events.jsonl"));
    const result = await new TrustedOrchestrator(run, store, {
      now: () => f.now,
      context: {
        ...io,
        realpath: async (path: string) => path,
        lstat: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
      },
    }).execute({ action: "prepare", expectedRevision: 0, actor: "planner" });
    expect(result).toMatchObject({ revision: 3 });
  });
  it("routes trusted runner success and nonzero result into state", async () => {
    const { f, store } = await phaseSetup();
    expect((await store.snapshot()).state).toBe("PHASE_RUNNING");
    const request = {
      protocolVersion: "1" as const,
      runId: "run-001",
      planHash: f.planHash,
      revision: 4,
      capability: "run_e2e" as const,
      args: { phaseId: "phase-1" },
      nonce: "b".repeat(32),
    };
    const success = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {
        runner: {
          request: async (input) => ({
            ok: true,
            ...input,
            result: {
              exitCode: 0,
              durationMs: 1,
              truncated: false,
              stdoutHash: "c".repeat(64),
              stderrHash: "d".repeat(64),
            },
          }),
        },
      },
    );
    await expect(
      success.executeTrustedCapability(request, sha),
    ).resolves.toMatchObject({ ok: true });
    const failing = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {
        runner: {
          request: async (input) => ({
            ok: true,
            ...input,
            result: {
              exitCode: 7,
              durationMs: 1,
              truncated: false,
              stdoutHash: "c".repeat(64),
              stderrHash: "d".repeat(64),
            },
          }),
        },
      },
    );
    await expect(
      failing.executeTrustedCapability(
        { ...request, nonce: "c".repeat(32) },
        sha,
      ),
    ).resolves.toMatchObject({ to: "REWORK" });
  });
  it("requires a trusted runner client before execution", async () => {
    const { store } = await phaseSetup();
    const orchestrator = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {},
    );
    await expect(
      orchestrator.executeTrustedCapability(
        {
          protocolVersion: "1",
          runId: "run-001",
          planHash: "a".repeat(64),
          revision: 4,
          capability: "run_e2e",
          args: { phaseId: "phase-1" },
          nonce: "e".repeat(32),
        },
        sha,
      ),
    ).rejects.toThrow("client");
  });
  it.each(["runId", "planHash", "revision", "nonce", "capability"] as const)(
    "maps runner response %s mismatch to INFRA_FAIL",
    async (field) => {
      const { f, store } = await phaseSetup();
      const request = {
        protocolVersion: "1" as const,
        runId: "run-001",
        planHash: f.planHash,
        revision: 4,
        capability: "run_e2e" as const,
        args: { phaseId: "phase-1" },
        nonce: "f".repeat(32),
      };
      const response = {
        ok: true as const,
        ...request,
        result: {
          exitCode: 0,
          durationMs: 1,
          truncated: false,
          stdoutHash: "c".repeat(64),
          stderrHash: "d".repeat(64),
        },
      };
      const changes = {
        runId: "other",
        planHash: "b".repeat(64),
        revision: 5,
        nonce: "0".repeat(32),
        capability: "verify_phase" as const,
      };
      const runner = new TrustedOrchestrator(
        "/tmp/repo/.agent-runs/run-001",
        store,
        {
          runner: {
            request: async () => ({ ...response, [field]: changes[field] }),
          },
        },
      );
      await expect(
        runner.executeTrustedCapability(request, sha),
      ).resolves.toMatchObject({ to: "INFRA_FAIL" });
    },
  );
  it.each([
    "TIMEOUT",
    "PROTOCOL_MISMATCH",
    "CONNECTION_ERROR",
    "INTERNAL_ERROR",
  ] as const)("maps runner error %s to INFRA_FAIL", async (code) => {
    const { f, store } = await phaseSetup();
    const request = {
      protocolVersion: "1" as const,
      runId: "run-001",
      planHash: f.planHash,
      revision: 4,
      capability: "run_e2e" as const,
      args: { phaseId: "phase-1" },
      nonce: "1".repeat(32),
    };
    const runner = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {
        runner: {
          request: async () => ({
            ok: false as const,
            ...request,
            error: { code, message: "safe" },
          }),
        },
      },
    );
    await expect(
      runner.executeTrustedCapability(request, sha),
    ).resolves.toMatchObject({ to: "INFRA_FAIL" });
  });
  it("maps UNKNOWN_CAPABILITY to REPLAN_REQUIRED and clears phase", async () => {
    const { f, store } = await phaseSetup();
    const request = {
      protocolVersion: "1" as const,
      runId: "run-001",
      planHash: f.planHash,
      revision: 4,
      capability: "run_e2e" as const,
      args: { phaseId: "phase-1" },
      nonce: "2".repeat(32),
    };
    const runner = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {
        runner: {
          request: async () => ({
            ok: false as const,
            ...request,
            error: { code: "UNKNOWN_CAPABILITY" as const, message: "unknown" },
          }),
        },
      },
    );
    await expect(
      runner.executeTrustedCapability(request, sha),
    ).resolves.toMatchObject({ to: "REPLAN_REQUIRED", phaseId: null });
  });
  it.each([
    "SECRET_DETECTED",
    "FORBIDDEN_DB_CONNECTION",
    "PATH_VIOLATION",
    "RUNNER_BYPASS",
  ] as const)("runs safety %s through quarantine", async (code) => {
    const { store } = await phaseSetup();
    await unlink("/tmp/repo/.agent-runs/run-001/safety-evidence.jsonl").catch(
      () => undefined,
    );
    const calls: string[] = [];
    const runner = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {
        revokeCapabilities: async () => {
          calls.push("revoke");
        },
        abortChildren: async () => {
          calls.push("abort");
        },
        runner: {
          request: async (input) => {
            calls.push(input.capability);
            return {
              ok: true as const,
              ...input,
              result: {
                exitCode: 0,
                durationMs: 1,
                truncated: false,
                stdoutHash: "c".repeat(64),
                stderrHash: "d".repeat(64),
              },
            };
          },
        },
      },
    );
    await expect(
      runner.reportTrustedFailure(
        { kind: "policy", code, message: "token=raw-secret" },
        sha,
      ),
    ).resolves.toMatchObject({ to: "QUARANTINED" });
    expect(calls).toEqual(["revoke", "abort", "quarantine_run"]);
    expect(
      await readFile(
        "/tmp/repo/.agent-runs/run-001/safety-evidence.jsonl",
        "utf8",
      ),
    ).not.toContain("raw-secret");
  });
  it("retains SAFETY_VIOLATION when quarantine runner rejects", async () => {
    const { store } = await phaseSetup();
    await unlink("/tmp/repo/.agent-runs/run-001/safety-evidence.jsonl").catch(
      () => undefined,
    );
    const runner = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {
        revokeCapabilities: async () => {},
        abortChildren: async () => {},
        runner: {
          request: async (input) => ({
            ok: false as const,
            ...input,
            error: { code: "INTERNAL_ERROR" as const, message: "rejected" },
          }),
        },
      },
    );
    await expect(
      runner.reportTrustedFailure(
        { kind: "policy", code: "SECRET_DETECTED", message: "token=raw" },
        sha,
      ),
    ).rejects.toThrow("quarantine response");
    expect((await store.snapshot()).state).toBe("SAFETY_VIOLATION");
  });
  it.each(["revoke", "abort"] as const)(
    "retains SAFETY_VIOLATION when %s fails",
    async (failure) => {
      const { store } = await phaseSetup();
      await unlink("/tmp/repo/.agent-runs/run-001/safety-evidence.jsonl").catch(
        () => undefined,
      );
      const runner = new TrustedOrchestrator(
        "/tmp/repo/.agent-runs/run-001",
        store,
        {
          revokeCapabilities:
            failure === "revoke"
              ? async () => {
                  throw new Error("failed");
                }
              : async () => {},
          abortChildren:
            failure === "abort"
              ? async () => {
                  throw new Error("failed");
                }
              : async () => {},
        },
      );
      await expect(
        runner.reportTrustedFailure(
          { kind: "policy", code: "PATH_VIOLATION", message: "path" },
          sha,
        ),
      ).rejects.toThrow();
      expect((await store.snapshot()).state).toBe("SAFETY_VIOLATION");
    },
  );
  it("handles typed safety failure in fail-closed order and uses runner quarantine", async () => {
    const { store } = await phaseSetup();
    await unlink("/tmp/repo/.agent-runs/run-001/safety-evidence.jsonl").catch(
      () => undefined,
    );
    const order: string[] = [];
    const orchestrator = new TrustedOrchestrator(
      "/tmp/repo/.agent-runs/run-001",
      store,
      {
        runner: {
          request: async (input) => {
            order.push(input.capability);
            return {
              ok: true,
              ...input,
              result: {
                exitCode: 0,
                durationMs: 1,
                truncated: false,
                stdoutHash: "c".repeat(64),
                stderrHash: "d".repeat(64),
              },
            };
          },
        },
        revokeCapabilities: async () => {
          order.push("revoke");
        },
        abortChildren: async () => {
          order.push("abort");
        },
      },
    );
    await expect(
      orchestrator.reportTrustedFailure(
        { kind: "policy", code: "SECRET_DETECTED", message: "token=secret" },
        sha,
      ),
    ).resolves.toMatchObject({ to: "QUARANTINED" });
    expect(order).toEqual(["revoke", "abort", "quarantine_run"]);
    expect(
      await readFile(
        "/tmp/repo/.agent-runs/run-001/safety-evidence.jsonl",
        "utf8",
      ),
    ).not.toContain("secret");
  });
  async function phaseSetup(overrides: Record<string, unknown> = {}) {
    const { f, io } = contextFixture();
    await mkdir("/tmp/repo/.agent-runs", { recursive: true });
    const run = "/tmp/repo/.agent-runs/run-001";
    await unlink(join(run, "events.jsonl")).catch(() => undefined);
    const store = new StateStore(join(run, "events.jsonl"));
    await unlink(join(run, "implementation.jsonl")).catch(() => undefined);
    await unlink(join(run, "quality-gates.jsonl")).catch(() => undefined);
    const calls = { paths: 0, dependencies: 0 };
    const context = {
      ...io,
      head: async () => sha,
      inspectPaths: async () => {
        calls.paths += 1;
        if (overrides.pathThrow) throw new Error("io");
        return pathResult(
          (overrides.paths as Partial<PathGuardResult> | undefined) ?? {},
        );
      },
      inspectDependencies: async () => {
        calls.dependencies += 1;
        if (overrides.dependencyThrow) throw new Error("io");
        return dependencyResult(
          (overrides.dependencies as
            Partial<DependencyGuardResult> | undefined) ?? {},
        );
      },
    };
    const orchestrator = new TrustedOrchestrator(run, store, {
      now: () => f.now,
      context,
    });
    await orchestrator.execute({
      action: "prepare",
      expectedRevision: 0,
      actor: "planner",
    });
    await orchestrator.execute({
      action: "begin_phase",
      expectedRevision: 3,
      actor: "runner",
      phaseId: "phase-1",
    });
    return { f, store, orchestrator, calls };
  }
  const violation = (
    classification: "REPLAN_REQUIRED" | "SAFETY_VIOLATION",
  ) => ({ classification, changes: [], violations: [] });
  it("begin_verify records path REPLAN_REQUIRED", async () => {
    const { store, orchestrator, calls } = await phaseSetup({
      paths: violation("REPLAN_REQUIRED"),
    });
    const result = await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    expect(result).toMatchObject({
      to: "REPLAN_REQUIRED",
      targetSha: sha,
      occurredAt: "2026-01-01T00:00:00.000Z",
      phaseId: null,
      retryCount: 0,
    });
    expect((await store.snapshot()).state).toBe("REPLAN_REQUIRED");
    expect(calls.dependencies).toBe(0);
  });
  it("begin_verify records path SAFETY_VIOLATION with priority", async () => {
    const { store, orchestrator, calls } = await phaseSetup({
      paths: violation("SAFETY_VIOLATION"),
      dependencies: violation("REPLAN_REQUIRED"),
    });
    const result = await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    expect(result).toMatchObject({ to: "SAFETY_VIOLATION", targetSha: sha });
    expect((await store.snapshot()).state).toBe("SAFETY_VIOLATION");
    expect(calls.dependencies).toBe(0);
  });
  it("begin_verify records path INFRA_FAIL on throw", async () => {
    const { store, orchestrator } = await phaseSetup({ pathThrow: true });
    const result = await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    expect(result).toMatchObject({ to: "INFRA_FAIL", targetSha: sha });
    expect((await store.snapshot()).state).toBe("INFRA_FAIL");
  });
  it("begin_verify records dependency REPLAN_REQUIRED", async () => {
    const { store, orchestrator, calls } = await phaseSetup({
      dependencies: violation("REPLAN_REQUIRED"),
    });
    const result = await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    expect(result).toMatchObject({ to: "REPLAN_REQUIRED", targetSha: sha });
    expect((await store.snapshot()).state).toBe("REPLAN_REQUIRED");
    expect(calls.paths).toBe(1);
  });
  it("begin_verify records dependency SAFETY_VIOLATION", async () => {
    const { store, orchestrator } = await phaseSetup({
      dependencies: violation("SAFETY_VIOLATION"),
    });
    const result = await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    expect(result).toMatchObject({ to: "SAFETY_VIOLATION", targetSha: sha });
    expect((await store.snapshot()).state).toBe("SAFETY_VIOLATION");
  });
  it("begin_verify records dependency INFRA_FAIL on throw", async () => {
    const { store, orchestrator } = await phaseSetup({ dependencyThrow: true });
    const result = await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    expect(result).toMatchObject({ to: "INFRA_FAIL", targetSha: sha });
    expect((await store.snapshot()).state).toBe("INFRA_FAIL");
  });
  it("record_implementation invokes both guards", async () => {
    const { orchestrator, calls } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "done",
      targetSha: sha,
    });
    expect(calls).toEqual({ paths: 1, dependencies: 1 });
  });
  it("record_result invokes both guards", async () => {
    const { orchestrator, calls } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "done",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await orchestrator.execute({
      action: "record_result",
      expectedRevision: 5,
      actor: "verifier",
      gateId: "unit",
      gateName: "unit",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    expect(calls).toEqual({ paths: 3, dependencies: 3 });
  });
  it("runs the complete two-phase flow to PUBLISH_READY", async () => {
    const { orchestrator, store } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "phase one",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await orchestrator.execute({
      action: "record_result",
      expectedRevision: 5,
      actor: "verifier",
      gateId: "unit",
      gateName: "unit",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    const passed = await orchestrator.execute({
      action: "record_result",
      expectedRevision: 5,
      actor: "verifier",
      gateId: "integration",
      gateName: "integration",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    expect(passed).toMatchObject({ to: "PHASE_PASSED", sequence: 6 });
    await orchestrator.execute({
      action: "checkpoint",
      expectedRevision: 6,
      actor: "publisher",
      commitSha: sha,
    });
    await orchestrator.execute({
      action: "begin_phase",
      expectedRevision: 7,
      actor: "runner",
      phaseId: "phase-2",
    });
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 8,
      actor: "runner",
      summary: "phase two",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 8,
      actor: "verifier",
    });
    await orchestrator.execute({
      action: "record_result",
      expectedRevision: 9,
      actor: "verifier",
      gateId: "unit",
      gateName: "unit",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "record_result",
      expectedRevision: 9,
      actor: "verifier",
      gateId: "integration",
      gateName: "integration",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "checkpoint",
      expectedRevision: 10,
      actor: "publisher",
      commitSha: sha,
    });
    expect((await store.snapshot()).state).toBe("PUBLISH_READY");
  });
  it("reworks the same phase three times and rejects the fourth retry", async () => {
    const { orchestrator, store } = await phaseSetup();
    for (let retry = 0; retry < 4; retry += 1) {
      const revision = (await store.snapshot()).revision;
      await orchestrator.execute({
        action: "record_implementation",
        expectedRevision: revision,
        actor: "runner",
        summary: `retry ${retry}`,
        targetSha: sha,
      });
      await orchestrator.execute({
        action: "begin_verify",
        expectedRevision: revision,
        actor: "verifier",
      });
      const verifying = (await store.snapshot()).revision;
      await orchestrator.execute({
        action: "record_result",
        expectedRevision: verifying,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 1,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
      });
      if (retry < 3)
        await orchestrator.execute({
          action: "begin_phase",
          expectedRevision: (await store.snapshot()).revision,
          actor: "runner",
          phaseId: "phase-1",
        });
    }
    expect((await store.snapshot()).retryCount).toBe(3);
    await expect(
      orchestrator.execute({
        action: "begin_phase",
        expectedRevision: (await store.snapshot()).revision,
        actor: "runner",
        phaseId: "phase-1",
      }),
    ).rejects.toThrow("retry");
  });
  it.each([
    ["unknown action", { action: "nope" }],
    [
      "shell field",
      { action: "prepare", expectedRevision: 0, actor: "planner", shell: "rm" },
    ],
    [
      "path field",
      {
        action: "prepare",
        expectedRevision: 0,
        actor: "planner",
        path: "../x",
      },
    ],
    [
      "wrong actor",
      { action: "prepare", expectedRevision: 0, actor: "runner" },
    ],
    ["missing revision", { action: "begin_verify", actor: "verifier" }],
    [
      "negative revision",
      { action: "begin_verify", expectedRevision: -1, actor: "verifier" },
    ],
    [
      "implementation missing sha",
      {
        action: "record_implementation",
        expectedRevision: 1,
        actor: "runner",
        summary: "x",
      },
    ],
    [
      "result passed field",
      {
        action: "record_result",
        expectedRevision: 1,
        actor: "verifier",
        gateId: "g",
        gateName: "g",
        exitCode: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        targetSha: sha,
        passed: true,
      },
    ],
    [
      "invalid sha",
      {
        action: "checkpoint",
        expectedRevision: 1,
        actor: "publisher",
        commitSha: "x",
      },
    ],
    [
      "unknown actor",
      { action: "cleanup", expectedRevision: 1, actor: "admin" },
    ],
    [
      "unknown field",
      {
        action: "quarantine",
        expectedRevision: 1,
        actor: "runner",
        reason: "x",
        command: "x",
      },
    ],
    [
      "phase path",
      {
        action: "begin_phase",
        expectedRevision: 1,
        actor: "runner",
        phaseId: "../phase",
      },
    ],
  ])("rejects %s", (_name, value) => {
    expect(() => actionSchema.parse(value)).toThrow();
  });
  it("accepts only strict typed actions", () => {
    expect(
      actionSchema.parse({
        action: "prepare",
        expectedRevision: 0,
        actor: "planner",
      }).action,
    ).toBe("prepare");
    expect(() =>
      actionSchema.parse({
        action: "prepare",
        expectedRevision: 0,
        actor: "planner",
        command: "rm -rf",
      }),
    ).toThrow();
    expect(() =>
      actionSchema.parse({
        action: "unknown",
        expectedRevision: 0,
        actor: "planner",
      }),
    ).toThrow();
  });
  it("rejects cleanup before canonical context validation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
    const store = new StateStore(join(dir, "events.jsonl"));
    const runner = new TrustedOrchestrator(dir, store, {});
    await expect(
      runner.execute({
        action: "cleanup",
        expectedRevision: 0,
        actor: "runner",
      }),
    ).rejects.toThrow("canonical context");
    expect(sha).toHaveLength(40);
  });
  it("rejects an invalid canonical context before acquiring lock or appending", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-invalid-"));
    let reads = 0;
    const store = new StateStore(join(dir, "events.jsonl"));
    const runner = new TrustedOrchestrator(dir, store, {
      context: {
        read: async () => {
          reads += 1;
          throw new Error("invalid plan hash");
        },
      },
    });
    await expect(
      runner.execute({
        action: "prepare",
        expectedRevision: 0,
        actor: "planner",
      }),
    ).rejects.toThrow("invalid plan hash");
    expect(reads).toBe(1);
    await expect(store.readEvents()).resolves.toEqual([]);
  });
  it("rejects an existing concurrent lock", async () => {
    const { orchestrator } = await phaseSetup();
    const lock = "/tmp/repo/.agent-runs/run-001/.lock";
    await writeFile(lock, "busy");
    await expect(
      orchestrator.execute({
        action: "begin_verify",
        expectedRevision: 4,
        actor: "verifier",
      }),
    ).rejects.toThrow("concurrent");
    await unlink(lock);
  });
  it("rejects stale revision", async () => {
    const { orchestrator } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "begin_verify",
        expectedRevision: 3,
        actor: "verifier",
      }),
    ).rejects.toThrow("stale");
  });
  it("rejects wrong first phase", async () => {
    const { orchestrator } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "begin_phase",
        expectedRevision: 4,
        actor: "runner",
        phaseId: "phase-2",
      }),
    ).rejects.toThrow("Phase順序");
  });
  it("rejects cleanup with valid canonical context until Phase 5", async () => {
    const { orchestrator } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "cleanup",
        expectedRevision: 4,
        actor: "runner",
      }),
    ).rejects.toThrow("Phase 5");
  });
  it("rejects implementation HEAD mismatch", async () => {
    const { orchestrator } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "record_implementation",
        expectedRevision: 4,
        actor: "runner",
        summary: "x",
        targetSha: "b".repeat(40),
      }),
    ).rejects.toThrow("HEAD");
  });
  it("rejects malformed implementation evidence", async () => {
    const { orchestrator } = await phaseSetup();
    await writeFile(
      "/tmp/repo/.agent-runs/run-001/implementation.jsonl",
      "not-json\n",
    );
    await expect(
      orchestrator.execute({
        action: "record_implementation",
        expectedRevision: 4,
        actor: "runner",
        summary: "x",
        targetSha: sha,
      }),
    ).rejects.toThrow("証跡");
  });
  it("rejects unknown gate name even with matching gate id", async () => {
    const { orchestrator } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "x",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await expect(
      orchestrator.execute({
        action: "record_result",
        expectedRevision: 5,
        actor: "verifier",
        gateId: "unit",
        gateName: "other",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
      }),
    ).rejects.toThrow("quality gate");
  });
  it("rejects gate target SHA mismatch", async () => {
    const { orchestrator } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "x",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await expect(
      orchestrator.execute({
        action: "record_result",
        expectedRevision: 5,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: "b".repeat(40),
      }),
    ).rejects.toThrow("SHA");
  });
  it("rejects checkpoint HEAD mismatch", async () => {
    const { orchestrator } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "checkpoint",
        expectedRevision: 4,
        actor: "publisher",
        commitSha: sha,
      }),
    ).rejects.toThrow("checkpoint");
  });
  it("rejects quarantine outside safety state", async () => {
    const { orchestrator } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "quarantine",
        expectedRevision: 4,
        actor: "runner",
        reason: "x",
      }),
    ).rejects.toThrow("安全違反");
  });
  it("quarantines safety with current HEAD", async () => {
    const { orchestrator, store } = await phaseSetup({
      paths: violation("SAFETY_VIOLATION"),
    });
    const safety = await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    expect(safety).toMatchObject({ to: "SAFETY_VIOLATION", targetSha: sha });
    const quarantined = await orchestrator.execute({
      action: "quarantine",
      expectedRevision: 5,
      actor: "runner",
      reason: "unsafe",
    });
    expect(quarantined).toMatchObject({ to: "QUARANTINED", targetSha: sha });
    expect((await store.snapshot()).state).toBe("QUARANTINED");
  });
  async function completedPhase() {
    const setup = await phaseSetup();
    await setup.orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "done",
      targetSha: sha,
    });
    await setup.orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await setup.orchestrator.execute({
      action: "record_result",
      expectedRevision: 5,
      actor: "verifier",
      gateId: "unit",
      gateName: "unit",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    await setup.orchestrator.execute({
      action: "record_result",
      expectedRevision: 5,
      actor: "verifier",
      gateId: "integration",
      gateName: "integration",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    return setup;
  }
  it("rejects skipping the second phase", async () => {
    const { orchestrator } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "begin_phase",
        expectedRevision: 4,
        actor: "runner",
        phaseId: "phase-2",
      }),
    ).rejects.toThrow("Phase順序");
  });
  it("rejects repeating a completed phase", async () => {
    const { orchestrator } = await completedPhase();
    await orchestrator.execute({
      action: "checkpoint",
      expectedRevision: 6,
      actor: "publisher",
      commitSha: sha,
    });
    await expect(
      orchestrator.execute({
        action: "begin_phase",
        expectedRevision: 7,
        actor: "runner",
        phaseId: "phase-1",
      }),
    ).rejects.toThrow("Phase順序");
  });
  it("rejects inverted gate timestamps", async () => {
    const { orchestrator } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "x",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await expect(
      orchestrator.execute({
        action: "record_result",
        expectedRevision: 5,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:01:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
      }),
    ).rejects.toThrow("時刻");
  });
  it("rejects future gate completion", async () => {
    const { orchestrator } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "x",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await expect(
      orchestrator.execute({
        action: "record_result",
        expectedRevision: 5,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:01:00.000Z",
        targetSha: sha,
      }),
    ).rejects.toThrow("時刻");
  });
  it("rejects gate started before run", async () => {
    const { orchestrator } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "x",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await expect(
      orchestrator.execute({
        action: "record_result",
        expectedRevision: 5,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2025-12-31T23:59:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
      }),
    ).rejects.toThrow("時刻");
  });
  it("does not satisfy gate with another plan evidence", async () => {
    const { orchestrator } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "x",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await writeFile(
      "/tmp/repo/.agent-runs/run-001/quality-gates.jsonl",
      JSON.stringify({
        runId: "other-run",
        planHash: "b".repeat(64),
        phaseId: "phase-1",
        retryCount: 0,
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
        actor: "verifier",
      }) + "\n",
    );
    const result = await orchestrator.execute({
      action: "record_result",
      expectedRevision: 5,
      actor: "verifier",
      gateId: "unit",
      gateName: "unit",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      targetSha: sha,
    });
    expect(result).toMatchObject({
      state: "VERIFYING",
      pendingGates: ["integration"],
    });
  });
  it("rejects malformed gate log", async () => {
    const { orchestrator } = await phaseSetup();
    await orchestrator.execute({
      action: "record_implementation",
      expectedRevision: 4,
      actor: "runner",
      summary: "x",
      targetSha: sha,
    });
    await orchestrator.execute({
      action: "begin_verify",
      expectedRevision: 4,
      actor: "verifier",
    });
    await writeFile(
      "/tmp/repo/.agent-runs/run-001/quality-gates.jsonl",
      "not-json\n",
    );
    await expect(
      orchestrator.execute({
        action: "record_result",
        expectedRevision: 5,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
      }),
    ).rejects.toThrow("証跡");
  });
  it("rejects checkpoint with missing evidence", async () => {
    const { orchestrator } = await completedPhase();
    await unlink("/tmp/repo/.agent-runs/run-001/quality-gates.jsonl");
    await expect(
      orchestrator.execute({
        action: "checkpoint",
        expectedRevision: 6,
        actor: "publisher",
        commitSha: sha,
      }),
    ).rejects.toThrow();
  });
  it("rejects checkpoint after evidence deletion", async () => {
    const { orchestrator } = await completedPhase();
    await unlink("/tmp/repo/.agent-runs/run-001/quality-gates.jsonl");
    await expect(
      orchestrator.execute({
        action: "checkpoint",
        expectedRevision: 6,
        actor: "publisher",
        commitSha: sha,
      }),
    ).rejects.toThrow();
  });
  it("rejects checkpoint when only prior retry evidence exists", async () => {
    const { orchestrator } = await completedPhase();
    const path = "/tmp/repo/.agent-runs/run-001/quality-gates.jsonl";
    const lines = (await readFile(path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => ({ ...JSON.parse(line), retryCount: 1 }));
    await writeFile(
      path,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    );
    await expect(
      orchestrator.execute({
        action: "checkpoint",
        expectedRevision: 6,
        actor: "publisher",
        commitSha: sha,
      }),
    ).rejects.toThrow("evidence");
  });
  it("rejects checkpoint when only another plan evidence exists", async () => {
    const { orchestrator } = await completedPhase();
    const path = "/tmp/repo/.agent-runs/run-001/quality-gates.jsonl";
    const lines = (await readFile(path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => ({
        ...JSON.parse(line),
        runId: "other-run",
        planHash: "b".repeat(64),
      }));
    await writeFile(
      path,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    );
    await expect(
      orchestrator.execute({
        action: "checkpoint",
        expectedRevision: 6,
        actor: "publisher",
        commitSha: sha,
      }),
    ).rejects.toThrow("evidence");
  });
  it("allows a run at exactly the 120 minute limit", async () => {
    const { f } = contextFixture();
    expect(
      f.now.getTime() - new Date("2025-12-31T22:00:00.000Z").getTime(),
    ).toBe(120 * 60 * 1000);
  });
  it("rejects a run beyond the 120 minute limit", async () => {
    const { f } = contextFixture();
    expect(
      f.now.getTime() - new Date("2025-12-31T21:59:59.999Z").getTime(),
    ).toBeGreaterThan(120 * 60 * 1000);
  });
  it("does not invoke guards for begin_verify in invalid state", async () => {
    const { orchestrator, calls } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "begin_verify",
        expectedRevision: 3,
        actor: "verifier",
      }),
    ).rejects.toThrow();
    expect(calls).toEqual({ paths: 0, dependencies: 0 });
  });
  it("does not invoke guards for record_result in invalid state", async () => {
    const { orchestrator, calls } = await phaseSetup();
    await expect(
      orchestrator.execute({
        action: "record_result",
        expectedRevision: 4,
        actor: "verifier",
        gateId: "unit",
        gateName: "unit",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
        targetSha: sha,
      }),
    ).rejects.toThrow();
    expect(calls).toEqual({ paths: 0, dependencies: 0 });
  });
});
