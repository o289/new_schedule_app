import { describe, expect, it } from "vitest";
import { inspectPaths, parseNulPaths, parseRawDiff } from "./path-guard";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
const execFile = promisify(execFileCallback);
const hasGit = await execFile("git", ["--version"])
  .then(() => true)
  .catch(() => false);
const sha = "a".repeat(40);
const io = (diff: string, untracked = "") => ({
  run: async (args: string[]) => {
    if (args[0] !== "diff") return untracked;
    if (diff === "" || diff.startsWith(":")) return diff;
    const fields = diff.split("\0").filter(Boolean);
    return `:100644 100644 ${"a".repeat(40)} ${"b".repeat(40)} ${fields[0]}\0${fields[1]}\0`;
  },
});
describe("path guard", () => {
  it("parses NUL rename and copy pairs", () => {
    expect(
      parseRawDiff(
        ":100644 100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb R100\0old.ts\0new.ts\0",
      ),
    ).toHaveLength(1);
  });
  it("rejects abbreviated raw SHA", () => {
    expect(() =>
      parseRawDiff(":100644 100644 aaaaaaaa bbbbbbbb M\0file\0"),
    ).toThrow();
  });
  it("strictly parses untracked NUL paths", () => {
    expect(parseNulPaths("space name\0line\nname\0")).toEqual([
      "space name",
      "line\nname",
    ]);
    expect(() => parseNulPaths("file")).toThrow();
    expect(() => parseNulPaths("file\0\0")).toThrow();
  });
  it("accepts exact and recursive allowed paths", async () => {
    const result = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: ["src/**", "README.md"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io(
        `:100644 100644 ${"a".repeat(40)} ${"b".repeat(40)} M\0src/a.ts\0`,
        "README.md\0",
      ),
    );
    expect(result.classification).toBe("CLEAN");
  });
  it("prioritizes forbidden paths", async () => {
    const result = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: [".env"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io("", ".env\0"),
    );
    expect(result.classification).toBe("SAFETY_VIOLATION");
  });
  it("classifies unregistered paths as replan", async () => {
    const result = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: ["src/**"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io("", "other.ts\0"),
    );
    expect(result.classification).toBe("REPLAN_REQUIRED");
  });
  it("rejects unsafe path rules", async () => {
    await expect(
      inspectPaths(
        {
          root: "/repo",
          startSha: sha,
          allowedPaths: ["../escape"],
          forbiddenPaths: [".git/**"],
        },
        io(""),
      ),
    ).rejects.toThrow();
  });
  it("accepts clean diff", async () => {
    expect(
      (
        await inspectPaths(
          {
            root: "/repo",
            startSha: sha,
            allowedPaths: ["src/**"],
            forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
          },
          io(""),
        )
      ).classification,
    ).toBe("CLEAN");
  });
  it("accepts allowed exact path", async () => {
    expect(
      (
        await inspectPaths(
          {
            root: "/repo",
            startSha: sha,
            allowedPaths: ["README.md"],
            forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
          },
          io(
            `:100644 100644 ${"a".repeat(40)} ${"b".repeat(40)} M\0README.md\0`,
          ),
        )
      ).classification,
    ).toBe("CLEAN");
  });
  it("reports rename old and new", async () => {
    const r = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: ["new.ts"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io(
        `:100644 100644 ${"a".repeat(40)} ${"b".repeat(40)} R100\0old.ts\0new.ts\0`,
      ),
    );
    expect(r.violations[0]?.path).toBe("old.ts");
  });
  it("reports copy old and new", () => {
    const r = parseRawDiff(
      ":100644 100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb C100\0old.ts\0new.ts\0",
    );
    expect(r).toEqual([{ path: "new.ts", oldPath: "old.ts", kind: "copy" }]);
  });
  it("treats mode-only and submodule records as changes", () => {
    expect(
      parseRawDiff(
        ":100644 100755 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb M\0mode.sh\0",
      ).map((x) => x.path),
    ).toEqual(["mode.sh"]);
  });
  it("preserves whitespace and newline paths", () => {
    expect(
      parseRawDiff(
        ":100644 100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb M\0space name.ts\0",
      ).map((x) => x.path),
    ).toEqual(["space name.ts"]);
  });
  it("rejects env variants", async () => {
    const r = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: [".env.local"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io("", ".env.local\0"),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("rejects git metadata", async () => {
    const r = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: [".git/config"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io("", ".git/config\0"),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it("rejects agent run artifacts", async () => {
    const r = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: ["docs/agent-runs/x"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io("", "docs/agent-runs/x\0"),
    );
    expect(r.classification).toBe("SAFETY_VIOLATION");
  });
  it.each(["/absolute", "../escape", "a\\b", "a\0b", "a//b"])(
    "rejects unsafe path rule %s",
    async (bad) => {
      await expect(
        inspectPaths(
          {
            root: "/repo",
            startSha: sha,
            allowedPaths: [bad],
            forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
          },
          io(""),
        ),
      ).rejects.toThrow();
    },
  );
  it("rejects registered-outside path", async () => {
    const r = await inspectPaths(
      {
        root: "/repo",
        startSha: sha,
        allowedPaths: ["src/**"],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      },
      io(`:100644 100644 ${"a".repeat(40)} ${"b".repeat(40)} M\0other.ts\0`),
    );
    expect(r.violations[0]?.classification).toBe("REPLAN_REQUIRED");
  });
  it.runIf(hasGit)(
    "collects real committed, staged, unstaged, untracked, rename and mode changes",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "path-guard-real-"));
      const git = async (args: string[]) =>
        (await execFile("git", args, { cwd: root })).stdout.trim();
      await git(["init"]);
      await git(["config", "user.name", "test"]);
      await git(["config", "user.email", "test@example.com"]);
      await writeFile(join(root, "tracked.txt"), "start");
      await writeFile(join(root, "rename.txt"), "rename");
      await writeFile(join(root, "mode.sh"), "#!/bin/sh\n");
      await git(["add", "."]);
      await git(["commit", "-m", "start"]);
      const start = await git(["rev-parse", "HEAD"]);
      await writeFile(join(root, "committed.txt"), "committed");
      await git(["add", "committed.txt"]);
      await git(["commit", "-m", "next"]);
      await writeFile(join(root, "tracked.txt"), "unstaged");
      await writeFile(join(root, "staged.txt"), "staged");
      await git(["add", "staged.txt"]);
      await git(["mv", "rename.txt", "renamed.txt"]);
      await chmod(join(root, "mode.sh"), 0o755);
      await writeFile(join(root, "untracked.txt"), "untracked");
      const result = await inspectPaths({
        root,
        startSha: start,
        allowedPaths: [
          "rename.txt",
          "tracked.txt",
          "committed.txt",
          "staged.txt",
          "renamed.txt",
          "mode.sh",
          "untracked.txt",
        ],
        forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
      });
      expect(result.classification).toBe("CLEAN");
      expect(result.changes.some((change) => change.kind === "rename")).toBe(
        true,
      );
      expect(result.changes.some((change) => change.kind === "mode")).toBe(
        true,
      );
      expect(result.changes.map((change) => change.path)).toEqual(
        expect.arrayContaining([
          "committed.txt",
          "tracked.txt",
          "staged.txt",
          "renamed.txt",
          "mode.sh",
          "untracked.txt",
        ]),
      );
    },
  );
});
