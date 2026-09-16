import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hashPlan } from "./plan-hash";
import { runCommand, type RunCommandIO } from "./run-command";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const makeIO = (initial: Record<string, string> = {}) => {
  const files = new Map(Object.entries(initial));
  const writes: string[] = [];
  const io: RunCommandIO = {
    read: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing ${path}`);
      writes.push(`read:${path}`);
      return value;
    },
    writeExclusive: async (path, content) => {
      if (files.has(path)) throw new Error(`EEXIST: ${path}`);
      files.set(path, content);
      writes.push(`write:${path}`);
    },
    mkdir: async () => undefined,
    run: async () => "",
  };
  return { files, writes, io };
};

async function sourcePlan(runId: string) {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      fileURLToPath(
        new URL("../../../../../docs/agent-plan-input.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  const plan = JSON.parse(source) as Record<string, unknown>;
  plan.runId = runId;
  return JSON.stringify(plan);
}

describe("run command", () => {
  it("create generates every artifact in one run and never writes docs", async () => {
    const source = await sourcePlan("run-a");
    const f = makeIO({
      "ai/runs/run-a/plan.source.json": source,
    });
    await runCommand("create", "run-a", "/tmp/repo", f.io);
    expect([...f.files.keys()]).toEqual(
      expect.arrayContaining([
        "ai/runs/run-a/plan.json",
        "ai/runs/run-a/agent-plan.md",
        "ai/runs/run-a/manifest.json",
        "human/runs/run-a/plan-review.html",
      ]),
    );
    expect([...f.files.keys()].some((path) => path.startsWith("docs/"))).toBe(
      false,
    );
    expect(f.writes.some((path) => path.includes("docs/"))).toBe(false);
  });

  it("rejects duplicate create and keeps run A/B artifacts separate", async () => {
    const a = makeIO({
      "ai/runs/run-a/plan.source.json": await sourcePlan("run-a"),
    });
    const b = makeIO({
      "ai/runs/run-b/plan.source.json": await sourcePlan("run-b"),
    });
    await runCommand("create", "run-a", "/tmp/repo", a.io);
    await expect(
      runCommand("create", "run-a", "/tmp/repo", a.io),
    ).rejects.toThrow("EEXIST");
    await runCommand("create", "run-b", "/tmp/repo", b.io);
    expect([...a.files.keys()].some((path) => path.includes("run-b"))).toBe(
      false,
    );
    expect([...b.files.keys()].some((path) => path.includes("run-a"))).toBe(
      false,
    );
  });

  it.each(["../run-a", "run/a"])(
    "rejects path traversal runId: %s",
    async (runId) => {
      const f = makeIO();
      await expect(
        runCommand("create", runId, "/tmp/repo", f.io),
      ).rejects.toThrow();
    },
  );

  it("approve accepts a valid run approval and rejects hash or expiry mismatch", async () => {
    const source = await sourcePlan("run-a");
    const plan = JSON.parse(source);
    const planContent = JSON.stringify(plan, null, 2) + "\n";
    const approvedAt = new Date(Date.now() - 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const base = {
      schemaVersion: 2,
      runId: "run-a",
      plan: { path: "ai/runs/run-a/plan.json", sha256: digest(planContent) },
      planHash: hashPlan(plan),
      approvedBy: "reviewer",
      approvedAt,
      expiresAt,
    };
    const f = makeIO({
      "ai/runs/run-a/approval-input.json": JSON.stringify(base),
      "ai/runs/run-a/plan.json": planContent,
      "docs/agent-plan-approval-input.json": "legacy",
    });
    await runCommand("approve", "run-a", "/tmp/repo", f.io);
    expect(f.files.has("ai/runs/run-a/approval.json")).toBe(true);
    const bad = makeIO({
      "ai/runs/run-a/approval-input.json": JSON.stringify({
        ...base,
        planHash: "0".repeat(64),
      }),
      "ai/runs/run-a/plan.json": planContent,
    });
    await expect(
      runCommand("approve", "run-a", "/tmp/repo", bad.io),
    ).rejects.toThrow();
    const expired = makeIO({
      "ai/runs/run-a/approval-input.json": JSON.stringify({
        ...base,
        approvedAt: "2020-01-01T00:00:00.000Z",
        expiresAt: "2020-01-02T00:00:00.000Z",
      }),
      "ai/runs/run-a/plan.json": planContent,
    });
    await expect(
      runCommand("approve", "run-a", "/tmp/repo", expired.io),
    ).rejects.toThrow();
  });

  it("does not read global inputs or records during a run command", async () => {
    const f = makeIO({
      "ai/runs/run-a/plan.source.json": await sourcePlan("run-a"),
      "docs/pr-agent-start-record.json": "legacy",
      "docs/agent-plan-input.json": "legacy",
    });
    await runCommand("create", "run-a", "/tmp/repo", f.io);
    expect(f.writes).not.toContain("read:docs/pr-agent-start-record.json");
    expect(f.writes).not.toContain("read:docs/agent-plan-input.json");
    expect(f.writes.every((path) => !path.startsWith("write:docs/"))).toBe(
      true,
    );
  });

  it("start creates an exclusive run start record with stubbed Git IO", async () => {
    const paths = {
      plan: "ai/runs/run-a/plan.json",
      approval: "ai/runs/run-a/approval.json",
      implementation: "ai/runs/run-a/agent-plan.md",
    };
    const input = {
      schemaVersion: 2,
      approved: true,
      size: "medium",
      mode: "push_only",
      sourceBranch: "feature/v3.2.3",
      head: "feature/v3.2.3",
      reviewBaseSha: "a".repeat(40),
      assessment: {
        phaseCount: 1,
        plannedFiles: ["a.ts"],
        authenticationChanged: false,
        dbModels: [],
        dependentDbModels: false,
        directImplementation: false,
      },
      plan: {
        runId: "run-a",
        planHash: "a".repeat(64),
        path: paths.plan,
        sha256: "b".repeat(64),
      },
      approval: {
        runId: "run-a",
        planHash: "a".repeat(64),
        path: paths.approval,
        sha256: "c".repeat(64),
      },
      implementation: { path: paths.implementation, sha256: "d".repeat(64) },
    };
    const f = makeIO({
      "ai/runs/run-a/start-input.json": JSON.stringify(input),
    });
    f.io.start = async () => ({ ...input, completed: true }) as never;
    await runCommand("start", "run-a", "/tmp/repo", f.io);
    expect(f.files.has("ai/runs/run-a/start.json")).toBe(true);
    await expect(
      runCommand("start", "run-a", "/tmp/repo", f.io),
    ).rejects.toThrow("EEXIST");
  });

  it("start rejects a plan ref belonging to another run", async () => {
    const input = {
      schemaVersion: 2,
      approved: true,
      size: "medium",
      mode: "push_only",
      sourceBranch: "feature/v3.2.3",
      head: "feature/v3.2.3",
      reviewBaseSha: "a".repeat(40),
      assessment: {
        phaseCount: 1,
        plannedFiles: ["a.ts"],
        authenticationChanged: false,
        dbModels: [],
        dependentDbModels: false,
        directImplementation: false,
      },
      plan: {
        runId: "run-a",
        planHash: "a".repeat(64),
        path: "ai/runs/run-b/plan.json",
        sha256: "b".repeat(64),
      },
      approval: {
        runId: "run-a",
        planHash: "a".repeat(64),
        path: "ai/runs/run-a/approval.json",
        sha256: "c".repeat(64),
      },
      implementation: {
        path: "ai/runs/run-a/agent-plan.md",
        sha256: "d".repeat(64),
      },
    };
    const f = makeIO({
      "ai/runs/run-a/start-input.json": JSON.stringify(input),
    });
    f.io.start = async () => ({ ...input, completed: true }) as never;
    await expect(
      runCommand("start", "run-a", "/tmp/repo", f.io),
    ).rejects.toThrow("run専用path");
    expect(f.files.has("ai/runs/run-a/start.json")).toBe(false);
  });
});
