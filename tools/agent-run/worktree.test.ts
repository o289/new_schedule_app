import { mkdir, mkdtemp, realpath, symlink, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorktree, worktreeMarkerSchema, type GitIO } from "./worktree";
const execFile = promisify(execFileCallback);
const hasGit = await execFile("git", ["--version"])
  .then(() => true)
  .catch(() => false);

const startSha = "a".repeat(40);
function fakeIo(
  overrides: Record<string, string> = {},
  sequences: Record<string, string[]> = {},
): GitIO & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args, cwd) {
      calls.push(args);
      const key = args.join(" ");
      if (key.startsWith("worktree add")) {
        await mkdir(args[5]!, { recursive: true });
        await mkdir(join(args[5]!, ".git"));
      }
      const sequence = sequences[key];
      if (sequence && sequence.length > 0) return sequence.shift()!;
      return (
        overrides[key] ??
        (args[0] === "remote"
          ? "https://github.com/o289/new_schedule_app.git"
          : args[0] === "rev-parse" && args[1] === "--show-toplevel"
            ? (cwd ?? "")
            : args[0] === "rev-parse" && args[1] === "--git-common-dir"
              ? ".git"
              : args[0] === "rev-parse"
                ? startSha
                : args[0] === "symbolic-ref"
                  ? "feature/v3.2.3"
                  : "")
      );
    },
  };
}
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "agent-worktree-"));
  await mkdir(join(root, ".git"));
  return root;
}

describe("createWorktree", () => {
  it("creates a fixed isolated worktree and marker without switching primary", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-worktree-"));
    await mkdir(join(root, ".git"));
    const io = fakeIo();
    const result = await createWorktree(
      { root, runId: "run-1", startSha, sourceBranch: "feature/v3.2.3" },
      io,
    );
    expect(result.branch).toBe("agent-run/run-1");
    expect(result.path).toBe(
      join(await realpath(root), ".agent-runs", "worktrees", "run-1"),
    );
    expect(worktreeMarkerSchema.parse(result.marker).repositoryRealpath).toBe(
      await realpath(root),
    );
    expect(io.calls.some((args) => args[0] === "switch")).toBe(false);
    expect(io.calls).toContainEqual([
      "worktree",
      "add",
      "--no-checkout",
      "-b",
      "agent-run/run-1",
      result.path,
      startSha,
    ]);
  });
  it("rejects invalid runId/path escape", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "../escape",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo(),
      ),
    ).rejects.toThrow("Invalid");
  });
  it("rejects unsafe sourceBranch", async () => {
    await expect(
      createWorktree(
        { root: await setup(), runId: "run-1", startSha, sourceBranch: "-bad" },
        fakeIo(),
      ),
    ).rejects.toThrow("Invalid");
  });
  it("rejects dirty checkout", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo({ "status --porcelain=v1 --untracked-files=all": " M file" }),
      ),
    ).rejects.toThrow("dirty");
  });
  it("rejects existing worktree path", async () => {
    const root = await setup();
    await mkdir(join(root, ".agent-runs", "worktrees", "run-1"), {
      recursive: true,
    });
    await expect(
      createWorktree(
        { root, runId: "run-1", startSha, sourceBranch: "feature/v3.2.3" },
        fakeIo(),
      ),
    ).rejects.toThrow("path");
  });
  it("rejects existing local branch", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo({
          "for-each-ref --format=%(refname) refs/heads/agent-run/run-1":
            "refs/heads/agent-run/run-1",
        }),
      ),
    ).rejects.toThrow("local branch");
  });
  it("rejects existing remote branch", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo({
          "ls-remote --heads origin refs/heads/agent-run/run-1":
            "sha refs/heads/agent-run/run-1",
        }),
      ),
    ).rejects.toThrow("remote branch");
  });
  it("rejects symlink parent", async () => {
    const root = await setup();
    const target = await mkdtemp(join(tmpdir(), "target-"));
    await mkdir(join(root, ".agent-runs"));
    await symlink(target, join(root, ".agent-runs", "worktrees"));
    await expect(
      createWorktree(
        { root, runId: "run-1", startSha, sourceBranch: "feature/v3.2.3" },
        fakeIo(),
      ),
    ).rejects.toThrow("symlink");
  });
  it("rejects source branch mismatch", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo({ "symbolic-ref --short HEAD": "main" }),
      ),
    ).rejects.toThrow("branch");
  });
  it("rejects HEAD mismatch", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo({ "rev-parse HEAD": "b".repeat(40) }),
      ),
    ).rejects.toThrow("SHA");
  });
  it("rejects fetch origin mismatch", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo({ "remote get-url --all origin": "bad" }),
      ),
    ).rejects.toThrow("origin");
  });
  it("rejects push origin mismatch", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo({ "remote get-url --push --all origin": "bad" }),
      ),
    ).rejects.toThrow("origin");
  });
  it("rejects repository root mismatch", async () => {
    const root = await setup();
    const other = await mkdtemp(join(tmpdir(), "other-root-"));
    await expect(
      createWorktree(
        { root, runId: "run-1", startSha, sourceBranch: "feature/v3.2.3" },
        fakeIo({ "rev-parse --show-toplevel": other }),
      ),
    ).rejects.toThrow("root");
  });
  it("rejects changed state in the final pre-add check", async () => {
    await expect(
      createWorktree(
        {
          root: await setup(),
          runId: "run-1",
          startSha,
          sourceBranch: "feature/v3.2.3",
        },
        fakeIo(
          {},
          { "status --porcelain=v1 --untracked-files=all": ["", " M changed"] },
        ),
      ),
    ).rejects.toThrow("dirty");
  });
  it("rolls back after marker failure", async () => {
    const root = await setup();
    const io = fakeIo();
    io.writeMarker = async () => {
      throw new Error("write");
    };
    await expect(
      createWorktree(
        { root, runId: "run-1", startSha, sourceBranch: "feature/v3.2.3" },
        io,
      ),
    ).rejects.toThrow("marker");
    expect(io.calls).toContainEqual([
      "worktree",
      "remove",
      "--force",
      join(await realpath(root), ".agent-runs", "worktrees", "run-1"),
    ]);
    expect(io.calls).toContainEqual(["branch", "-D", "agent-run/run-1"]);
  });
  it("reports rollback failures", async () => {
    const root = await setup();
    const io = fakeIo();
    io.writeMarker = async () => {
      throw new Error("write");
    };
    const original = io.run;
    io.run = async (args, cwd) => {
      if (args[0] === "worktree" || args[0] === "branch")
        throw new Error("rollback down");
      return original(args, cwd);
    };
    await expect(
      createWorktree(
        { root, runId: "run-1", startSha, sourceBranch: "feature/v3.2.3" },
        io,
      ),
    ).rejects.toThrow("rollback down");
  });
  it.runIf(hasGit)(
    "creates a real isolated worktree from a temporary git repository",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "agent-real-"));
      const bare = await mkdtemp(join(tmpdir(), "agent-bare-"));
      const git = async (args: string[], cwd = root) =>
        (await execFile("git", args, { cwd })).stdout.trim();
      await git(["init", "-b", "feature/v3.2.3"]);
      await git(["config", "user.name", "test"]);
      await git(["config", "user.email", "test@example.com"]);
      await git(["commit", "--allow-empty", "-m", "start"]);
      const start = await git(["rev-parse", "HEAD"]);
      await execFile("git", ["init", "--bare", bare]);
      await git(["remote", "add", "origin", bare]);
      const io: GitIO = {
        run: async (args, cwd) => (await execFile("git", args, { cwd })).stdout,
        isAllowedOrigin: (origin) => origin === bare,
      };
      const result = await createWorktree(
        {
          root,
          runId: "real-1",
          startSha: start,
          sourceBranch: "feature/v3.2.3",
        },
        io,
      );
      expect(await git(["symbolic-ref", "--short", "HEAD"])).toBe(
        "feature/v3.2.3",
      );
      expect(await git(["rev-parse", "HEAD"])).toBe(start);
      expect(await git(["rev-parse", "--verify", "agent-run/real-1"])).toBe(
        start,
      );
      const marker = worktreeMarkerSchema.parse(
        JSON.parse(
          await readFile(join(result.path, ".agent-run-marker.json"), "utf8"),
        ) as unknown,
      );
      expect(marker.repositoryRealpath).toBe(await realpath(root));
      expect(marker.gitCommonDir).toBe(await realpath(join(root, ".git")));
      await expect(
        createWorktree(
          {
            root,
            runId: "real-1",
            startSha: start,
            sourceBranch: "feature/v3.2.3",
          },
          io,
        ),
      ).rejects.toThrow();
    },
  );
});
