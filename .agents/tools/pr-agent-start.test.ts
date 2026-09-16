import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  classifyWork,
  startRecordPath,
  startTask,
  startTaskV2,
  validateStart,
  startInputSchema,
  startInputV2Schema,
  startRecordSchema,
} from "./pr-agent-start.js";
import { hashPlan, normalizePlan } from "./agent-run/plan-hash.js";
import { renderPlanMarkdown } from "./agent-run/plan-render.js";
import { parsePlan } from "./agent-run/plan-schema.js";
import type { StartInput, StartIO } from "./pr-agent-start.js";
const sha = "a".repeat(40);
const files = (count: number) =>
  Array.from({ length: count }, (_, i) => `file-${i}.ts`);
const assessment = {
  phaseCount: 3,
  plannedFiles: files(13),
  authenticationChanged: false,
  dbModels: [],
  dependentDbModels: false,
  directImplementation: false,
};
function fixture(large = false) {
  const plan = "承認済み計画";
  const input: StartInput = {
    schemaVersion: 1,
    approved: true,
    assessment: { ...assessment, phaseCount: large ? 5 : 3 },
    size: large ? "large" : "medium",
    mode: large ? "pull_request" : "push_only",
    sourceBranch: "feature/v3.2.3",
    head: large ? "feature/task-v3.2.3" : "feature/v3.2.3",
    ...(large ? { slug: "task" } : {}),
    reviewBaseSha: sha,
    plan: {
      path: "docs/plan.md",
      sha256: createHash("sha256").update(plan).digest("hex"),
    },
  };
  const state = {
    dirty: false,
    branch: input.sourceBranch,
    sha,
    local: "",
    remote: "",
    failRemote: false,
    url: "https://github.com/o289/new_schedule_app.git",
  };
  const calls: string[][] = [];
  const io: StartIO = {
    read: async () => plan,
    run: async (args) => {
      calls.push(args);
      switch (args[0]) {
        case "rev-parse":
          return args[1] === "--show-toplevel" ? process.cwd() : state.sha;
        case "remote":
          return state.url;
        case "status":
          return state.dirty ? " M x" : "";
        case "symbolic-ref":
          return state.branch;
        case "check-ref-format":
          return "";
        case "for-each-ref":
          return state.local;
        case "ls-remote":
          if (state.failRemote) throw new Error("network");
          return state.remote;
        case "switch":
          state.branch = input.head;
          return "";
        default:
          throw new Error(`unexpected ${args.join(" ")}`);
      }
    },
  };
  return { input, state, calls, io };
}
function fixtureV2() {
  const plan = {
    schemaVersion: 2,
    planId: "v2-plan",
    runId: "v2-run",
    objective: "v2",
    assumptions: [],
    openDecisions: [],
    phases: [
      {
        id: "phase-1",
        name: "v2",
        objective: "v2",
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
  const parsed = parsePlan(plan);
  const planText = normalizePlan(parsed);
  const planHash = hashPlan(parsed);
  const implementation = renderPlanMarkdown({ plan: parsed, planHash });
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const approval = {
    schemaVersion: 2,
    runId: parsed.runId,
    plan: { path: "ai/runs/v2-run/plan.json", sha256: digest(planText) },
    planHash,
    approvedBy: "owner",
    approvedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-03T00:00:00Z",
    completed: true,
  };
  const input = {
    schemaVersion: 2 as const,
    approved: true as const,
    assessment,
    size: "medium" as const,
    mode: "push_only" as const,
    sourceBranch: "feature/v3.2.3",
    head: "feature/v3.2.3",
    reviewBaseSha: sha,
    plan: {
      path: "ai/runs/v2-run/plan.json",
      sha256: digest(planText),
      runId: parsed.runId,
      planHash,
    },
    approval: {
      path: "ai/runs/v2-run/approval.json",
      sha256: digest(JSON.stringify(approval)),
      runId: parsed.runId,
      planHash,
    },
    implementation: {
      path: "ai/runs/v2-run/agent-plan.md",
      sha256: digest(implementation),
    },
  };
  const calls: string[][] = [];
  const state = { branch: input.sourceBranch };
  const texts: Record<string, string> = {
    [input.plan.path]: planText,
    [input.approval.path]: JSON.stringify(approval),
    [input.implementation.path]: implementation,
  };
  const io: StartIO = {
    read: async (path) => texts[path] ?? "",
    run: async (args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
        return process.cwd();
      if (args[0] === "rev-parse") return sha;
      if (args[0] === "remote")
        return "https://github.com/o289/new_schedule_app.git";
      if (args[0] === "symbolic-ref") return state.branch;
      if (args[0] === "status" || args[0] === "check-ref-format") return "";
      if (args[0] === "switch") {
        state.branch = input.head;
        return "";
      }
      throw new Error(`unexpected ${args.join(" ")}`);
    },
  };
  return { input, texts, calls, io, planHash, approval };
}

describe("work size", () => {
  it.each([
    [4, 99, false, [], false, "medium"],
    [5, 1, false, [], false, "large"],
    [1, 100, false, [], false, "large"],
    [2, 99, true, ["A", "B"], true, "medium"],
    [3, 1, true, [], false, "large"],
    [3, 1, false, ["A", "B"], true, "large"],
    [3, 1, false, ["A", "B"], false, "medium"],
    [3, 1, false, ["A"], false, "medium"],
  ] as const)(
    "classifies phases=%s files=%s auth=%s models=%s dependency=%s",
    (
      phaseCount,
      count,
      authenticationChanged,
      dbModels,
      dependentDbModels,
      expected,
    ) => {
      expect(
        classifyWork({
          ...assessment,
          phaseCount,
          plannedFiles: files(count),
          authenticationChanged,
          dbModels: [...dbModels],
          dependentDbModels,
        }),
      ).toBe(expected);
    },
  );
  it("keeps direct small work without a phase plan", () => {
    expect(
      classifyWork({
        ...assessment,
        phaseCount: 0,
        directImplementation: true,
      }),
    ).toBe("small");
  });
  it("rejects duplicate files, duplicate models and impossible dependencies", () => {
    expect(() =>
      classifyWork({ ...assessment, plannedFiles: ["a", "a"] }),
    ).toThrow();
    expect(() =>
      classifyWork({ ...assessment, dbModels: ["A", "A"] }),
    ).toThrow();
    expect(() =>
      classifyWork({ ...assessment, dependentDbModels: true }),
    ).toThrow();
  });
});
describe("task start", () => {
  it.each([
    "Run-001",
    "run_001",
    "run/001",
    "../other-run",
    "-run-001",
    "run-001-",
    "run--001",
    "run..001",
  ])("rejects invalid canonical runId: %s", (runId) => {
    expect(() => startRecordPath(runId)).toThrow();
  });

  it("derives separate run-scoped paths and never the global record path", () => {
    const runA = startRecordPath("run-001");
    const runB = startRecordPath("run-002");
    expect(runA).toBe("ai/runs/run-001/start.json");
    expect(runB).toBe("ai/runs/run-002/start.json");
    expect(runA).not.toBe(runB);
    expect(runA).not.toBe("docs/pr-agent-start-record.json");
    expect(runB).not.toBe("docs/pr-agent-start-record.json");
  });
  it("starts a valid v2 medium record without switching", async () => {
    const f = fixtureV2();
    const result = await startTaskV2(
      f.input,
      f.io,
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(result.completed).toBe(true);
    expect(f.calls.some((args) => args[0] === "switch")).toBe(false);
  });
  it.each([
    "plan-ref-hash",
    "canonical-hash",
    "plan-runId",
    "approval-ref-hash",
    "approval-runId",
    "approval-planHash",
    "expired",
    "implementation-ref-hash",
    "implementation-content",
    "plan-schema-version",
    "approval-schema-version",
    "args",
    "path-traversal",
  ])("v2 rejects %s before switch", async (problem) => {
    const f = fixtureV2();
    if (problem === "plan-ref-hash") f.input.plan.sha256 = "0".repeat(64);
    if (problem === "canonical-hash") f.input.plan.planHash = "0".repeat(64);
    if (problem === "plan-runId") f.input.plan.runId = "other";
    if (problem === "approval-ref-hash")
      f.input.approval.sha256 = "0".repeat(64);
    if (problem === "approval-runId") f.input.approval.runId = "other";
    if (problem === "approval-planHash")
      f.input.approval.planHash = "0".repeat(64);
    if (problem === "expired") {
      const approvalPath = f.input.approval.path;
      const approval = JSON.parse(f.texts[approvalPath] ?? "") as Record<
        string,
        unknown
      >;
      approval.expiresAt = "2026-01-01T00:00:01Z";
      f.texts[approvalPath] = JSON.stringify(approval);
      f.input.approval.sha256 = createHash("sha256")
        .update(f.texts[approvalPath] ?? "")
        .digest("hex");
    }
    if (problem === "implementation-ref-hash")
      f.input.implementation.sha256 = "0".repeat(64);
    if (problem === "implementation-content")
      f.texts[f.input.implementation.path] = "changed";
    if (problem === "plan-schema-version") {
      const planPath = f.input.plan.path;
      const plan = JSON.parse(f.texts[planPath] ?? "") as Record<
        string,
        unknown
      >;
      plan.schemaVersion = 1;
      f.texts[planPath] = JSON.stringify(plan);
      f.input.plan.sha256 = createHash("sha256")
        .update(f.texts[planPath] ?? "")
        .digest("hex");
    }
    if (problem === "approval-schema-version") {
      const approvalPath = f.input.approval.path;
      const approval = JSON.parse(f.texts[approvalPath] ?? "") as Record<
        string,
        unknown
      >;
      approval.schemaVersion = 1;
      f.texts[approvalPath] = JSON.stringify(approval);
      f.input.approval.sha256 = createHash("sha256")
        .update(f.texts[approvalPath] ?? "")
        .digest("hex");
    }
    if (problem === "path-traversal")
      f.input.plan.path = "ai/runs/v2-run/../plan.json";
    await expect(
      startTaskV2(
        f.input,
        f.io,
        new Date("2026-01-02T00:00:00Z"),
        problem === "args" ? ["extra"] : [],
      ),
    ).rejects.toThrow();
    expect(f.calls.some((args) => args[0] === "switch")).toBe(false);
  });
  it("accepts only v2 for new input while retaining v1 record compatibility", () => {
    expect(startInputV2Schema.safeParse(fixture().input).success).toBe(false);
    expect(
      startRecordSchema.safeParse({ ...fixture().input, completed: true })
        .success,
    ).toBe(true);
    const v2 = fixtureV2();
    expect(
      startRecordSchema.safeParse({ ...v2.input, completed: true }).success,
    ).toBe(true);
    expect(() => validateStart(v2.input)).not.toThrow();
  });
  it("records medium work without switching branches", async () => {
    const f = fixture();
    expect(await startTask(f.input, f.io)).toEqual({
      ...f.input,
      completed: true,
    });
    expect(f.calls.some((args) => args[0] === "switch")).toBe(false);
  });
  it("creates only the planned feature branch from the recorded SHA", async () => {
    const f = fixture(true);
    const result = await startTask(f.input, f.io);
    expect(result.head).toBe("feature/task-v3.2.3");
    expect(f.calls.filter((args) => args[0] === "switch")).toEqual([
      ["switch", "--no-track", "-c", f.input.head, sha],
    ]);
  });
  it.each([
    "dirty",
    "source",
    "sha",
    "local",
    "remote",
    "network",
    "url",
    "version",
    "size",
    "mode",
    "args",
    "plan",
  ])("rejects %s before branch creation", async (problem) => {
    const f = fixture(true);
    switch (problem) {
      case "dirty":
        f.state.dirty = true;
        break;
      case "source":
        f.state.branch = "main";
        break;
      case "sha":
        f.state.sha = "b".repeat(40);
        break;
      case "local":
        f.state.local = `refs/heads/${f.input.head}`;
        break;
      case "remote":
        f.state.remote = `${sha}\trefs/heads/${f.input.head}`;
        break;
      case "network":
        f.state.failRemote = true;
        break;
      case "url":
        f.state.url = "https://github.com/other/repo.git";
        break;
      case "version":
        f.input.head = "feature/task-v3.2.2";
        break;
      case "size":
        f.input.size = "small";
        break;
      case "mode":
        f.input.mode = "push_only";
        break;
      case "plan":
        f.input.plan.sha256 = "0".repeat(64);
        break;
    }
    await expect(
      startTask(f.input, f.io, problem === "args" ? ["extra"] : []),
    ).rejects.toThrow();
    expect(f.calls.some((args) => args[0] === "switch")).toBe(false);
  });
  it.each(["main", "release", "feature/task-v3.2.3", "HEAD"])(
    "rejects start source %s",
    (sourceBranch) => {
      expect(
        startInputSchema.safeParse({ ...fixture().input, sourceBranch })
          .success,
      ).toBe(false);
    },
  );
});
