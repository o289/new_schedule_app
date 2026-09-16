import { describe, expect, it } from "vitest";
import { cleanupInputSchema } from "./cleanup";
import { cleanupRun } from "./cleanup";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { spawnSync } from "node:child_process";
import { createEvent } from "./state-schema";
const execFile = promisify(execFileCallback);
const hasGit =
  spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const realGitIt = it.skipIf(!hasGit);
async function realFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cleanup-real-")));
  const remote = await realpath(
    await mkdtemp(join(tmpdir(), "cleanup-remote-")),
  );
  const git = async (args: string[], cwd = root) =>
    (await execFile("git", args, { cwd })).stdout;
  await git(["init", "-b", "main"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Test"]);
  await writeFile(join(root, "README"), "x\n");
  await git(["add", "README"]);
  await git(["commit", "-m", "init"]);
  const sha = (await git(["rev-parse", "HEAD"])).trim();
  await execFile("git", ["init", "--bare", remote]);
  await git(["remote", "add", "origin", remote]);
  await git(["push", "origin", "main"]);
  const worktree = join(root, ".agent-runs", "worktrees", "run-001");
  await git(["worktree", "add", "-b", "agent-run/run-001", worktree, sha]);
  const unregisteredWorktree = join(root, "unregistered-worktree");
  await git([
    "worktree",
    "add",
    "-b",
    "unregistered",
    unregisteredWorktree,
    sha,
  ]);
  const common = (
    await git(["rev-parse", "--git-common-dir"], worktree)
  ).trim();
  await writeFile(
    join(worktree, ".agent-run-marker.json"),
    JSON.stringify({
      schemaVersion: 1,
      runId: "run-001",
      repositoryRealpath: root,
      startSha: sha,
      taskBranch: "agent-run/run-001",
      gitCommonDir: await realpath(
        isAbsolute(common) ? common : join(worktree, common),
      ),
    }),
  );
  const event = createEvent({
    schemaVersion: 1,
    sequence: 1,
    previousEventHash: null,
    runId: "run-001",
    planHash: "a".repeat(64),
    actor: "runner",
    occurredAt: new Date().toISOString(),
    targetSha: sha,
    from: null,
    to: "PREPARED",
    phaseId: null,
    retryCount: 0,
  });
  await mkdir(join(root, ".agent-runs", "run-001"), { recursive: true });
  await writeFile(
    join(root, ".agent-runs", "run-001", "events.jsonl"),
    JSON.stringify(event) + "\n",
  );
  await git(["push", "origin", "agent-run/run-001"], worktree);
  return { root, sha, worktree, git, remote, unregisteredWorktree };
}
import { mkdir, realpath } from "node:fs/promises";

describe("cleanup contract", () => {
  realGitIt("successful cleanup preserves primary and remote", async () => {
    const f = await realFixture();
    const primaryBranchBefore = await f.git(
      ["symbolic-ref", "--short", "HEAD"],
      f.root,
    );
    const primaryHeadBefore = await f.git(["rev-parse", "HEAD"], f.root);
    const remoteRefsBefore = await f.git(["show-ref"], f.remote);
    const result = await cleanupRun({
      root: f.root,
      runId: "run-001",
      startSha: f.sha,
      taskBranch: "agent-run/run-001",
    });
    expect(result.runId).toBe("run-001");
    expect(await f.git(["symbolic-ref", "--short", "HEAD"], f.root)).toBe(
      primaryBranchBefore,
    );
    expect(await f.git(["rev-parse", "HEAD"], f.root)).toBe(primaryHeadBefore);
    const worktrees = await f.git(["worktree", "list", "--porcelain"], f.root);
    expect(worktrees).not.toContain(f.worktree);
    expect(worktrees).toContain(f.unregisteredWorktree);
    expect(await f.git(["show-ref"], f.remote)).toBe(remoteRefsBefore);
    await expect(
      f.git(["show-ref", "--verify", "refs/heads/agent-run/run-001"], f.remote),
    ).resolves.toContain(f.sha);
  });
  realGitIt("rejects marker mismatch", async () => {
    const f = await realFixture();
    await expect(
      cleanupRun({
        root: f.root,
        runId: "run-001",
        startSha: "b".repeat(40),
        taskBranch: "agent-run/run-001",
      }),
    ).rejects.toThrow();
  });
  realGitIt.each([
    ["runId", { runId: "other-run" }],
    ["repositoryRealpath", { repositoryRealpath: "/other/repository" }],
    ["startSha", { startSha: "b".repeat(40) }],
    ["taskBranch", { taskBranch: "agent-run/other-run" }],
    ["gitCommonDir", { gitCommonDir: "/other/.git" }],
  ])("rejects marker %s mismatch", async (_name, change) => {
    const f = await realFixture();
    const markerPath = join(f.worktree, ".agent-run-marker.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(markerPath, JSON.stringify({ ...marker, ...change }));
    await expect(
      cleanupRun({
        root: f.root,
        runId: "run-001",
        startSha: f.sha,
        taskBranch: "agent-run/run-001",
      }),
    ).rejects.toThrow();
  });
  it("rejects worktree path escape", async () => {
    expect(() =>
      cleanupInputSchema.parse({
        root: "/repo",
        runId: "../x",
        startSha: "a".repeat(40),
        taskBranch: "agent-run/x",
      }),
    ).toThrow();
  });
  realGitIt("rejects worktree symlink and realpath escape", async () => {
    const f = await realFixture();
    const outside = await realpath(
      await mkdtemp(join(tmpdir(), "cleanup-outside-")),
    );
    await f.git(["worktree", "remove", "--force", f.worktree]);
    const { symlink } = await import("node:fs/promises");
    await symlink(outside, f.worktree);
    await expect(
      cleanupRun({
        root: f.root,
        runId: "run-001",
        startSha: f.sha,
        taskBranch: "agent-run/run-001",
      }),
    ).rejects.toThrow();
  });
  it("accepts only an unposted registered run", () => {
    expect(
      cleanupInputSchema.parse({
        root: "/repo",
        runId: "run-001",
        startSha: "a".repeat(40),
        taskBranch: "agent-run/run-001",
      }).runId,
    ).toBe("run-001");
  });
  it("rejects caller-supplied publication claims", () => {
    expect(() =>
      cleanupInputSchema.parse({
        root: "/repo",
        runId: "run-001",
        startSha: "a".repeat(40),
        taskBranch: "agent-run/run-001",
        published: true,
      }),
    ).toThrow();
  });
  realGitIt("rejects state/run identity mismatch", async () => {
    const f = await realFixture();
    const eventPath = join(f.root, ".agent-runs", "run-001", "events.jsonl");
    const event = createEvent({
      schemaVersion: 1,
      sequence: 1,
      previousEventHash: null,
      runId: "other-run",
      planHash: "a".repeat(64),
      actor: "runner",
      occurredAt: new Date().toISOString(),
      targetSha: f.sha,
      from: null,
      to: "PREPARED",
      phaseId: null,
      retryCount: 0,
    });
    await writeFile(eventPath, JSON.stringify(event) + "\n");
    await expect(
      cleanupRun({
        root: f.root,
        runId: "run-001",
        startSha: f.sha,
        taskBranch: "agent-run/run-001",
      }),
    ).rejects.toThrow();
  });
  realGitIt("rejects terminal and safety states", async () => {
    const f = await realFixture();
    const eventPath = join(f.root, ".agent-runs", "run-001", "events.jsonl");
    const event = createEvent({
      schemaVersion: 1,
      sequence: 1,
      previousEventHash: null,
      runId: "run-001",
      planHash: "a".repeat(64),
      actor: "runner",
      occurredAt: new Date().toISOString(),
      targetSha: f.sha,
      from: null,
      to: "REPLAN_REQUIRED",
      phaseId: null,
      retryCount: 0,
    });
    await writeFile(eventPath, JSON.stringify(event) + "\n");
    await expect(
      cleanupRun({
        root: f.root,
        runId: "run-001",
        startSha: f.sha,
        taskBranch: "agent-run/run-001",
      }),
    ).rejects.toThrow();
  });
  realGitIt("rejects current branch mismatch", async () => {
    const f = await realFixture();
    await f.git(["symbolic-ref", "HEAD", "refs/heads/main"], f.worktree);
    await expect(
      cleanupRun({
        root: f.root,
        runId: "run-001",
        startSha: f.sha,
        taskBranch: "agent-run/run-001",
      }),
    ).rejects.toThrow();
  });
  realGitIt("rejects HEAD/start SHA mismatch", async () => {
    const f = await realFixture();
    await writeFile(join(f.worktree, "changed"), "changed\n");
    await f.git(["add", "changed"], f.worktree);
    await f.git(["commit", "-m", "changed"], f.worktree);
    await expect(
      cleanupRun({
        root: f.root,
        runId: "run-001",
        startSha: f.sha,
        taskBranch: "agent-run/run-001",
      }),
    ).rejects.toThrow();
  });
  realGitIt(
    "preserves worktree and branch when evidence mkdir fails",
    async () => {
      const f = await realFixture();
      const baseIO = {
        read: (path: string) => readFile(path, "utf8"),
        write: (path: string, content: string) => writeFile(path, content),
        realpath,
        run: f.git,
        mkdir: async () => {
          throw new Error("denied");
        },
      };
      await expect(
        cleanupRun(
          {
            root: f.root,
            runId: "run-001",
            startSha: f.sha,
            taskBranch: "agent-run/run-001",
          },
          baseIO,
        ),
      ).rejects.toThrow();
      await expect(
        f.git(["show-ref", "--verify", "refs/heads/agent-run/run-001"]),
      ).resolves.toBeTruthy();
      await expect(
        f.git(["rev-parse", "--is-bare-repository"], f.worktree),
      ).resolves.toBe("false\n");
    },
  );
  realGitIt(
    "preserves worktree and branch when evidence write fails",
    async () => {
      const f = await realFixture();
      const baseIO = {
        read: (path: string) => readFile(path, "utf8"),
        write: async () => {
          throw new Error("denied");
        },
        realpath,
        run: f.git,
        mkdir: async (path: string): Promise<void> => {
          await (
            await import("node:fs/promises")
          ).mkdir(path, { recursive: true });
        },
      };
      await expect(
        cleanupRun(
          {
            root: f.root,
            runId: "run-001",
            startSha: f.sha,
            taskBranch: "agent-run/run-001",
          },
          baseIO,
        ),
      ).rejects.toThrow();
      await expect(
        f.git(["show-ref", "--verify", "refs/heads/agent-run/run-001"]),
      ).resolves.toBeTruthy();
      await expect(
        f.git(["rev-parse", "--is-bare-repository"], f.worktree),
      ).resolves.toBe("false\n");
    },
  );
  realGitIt(
    "redacts secrets and preserves complete raw event log",
    async () => {
      const f = await realFixture();
      const eventPath = join(f.root, ".agent-runs", "run-001", "events.jsonl");
      const raw = await readFile(eventPath, "utf8");
      const result = await cleanupRun(
        {
          root: f.root,
          runId: "run-001",
          startSha: f.sha,
          taskBranch: "agent-run/run-001",
        },
        {
          read: (path) => readFile(path, "utf8"),
          write: (path, content) => writeFile(path, content),
          realpath,
          run: async (args, cwd) =>
            args[0] === "status" ? "token=super-secret\n" : f.git(args, cwd),
          mkdir: async (path): Promise<void> => {
            await (
              await import("node:fs/promises")
            ).mkdir(path, { recursive: true });
          },
        },
      );
      expect(result.state).toBe("PREPARED");
      const evidence = JSON.parse(
        await readFile(
          join(f.root, ".agent-runs", "run-001", "cleanup-evidence.json"),
          "utf8",
        ),
      ) as { redactedStatus: string; events: string };
      expect(evidence.redactedStatus).toContain("[REDACTED]");
      expect(evidence.events).toBe(raw);
    },
  );
  it("rejects branch/path mismatch input", () => {
    expect(() =>
      cleanupInputSchema.parse({
        root: "/repo",
        runId: "../run",
        startSha: "a".repeat(40),
        taskBranch: "agent-run/run",
      }),
    ).toThrow();
  });
});
