import { describe, expect, it } from "vitest";
import { prepareLegacyImport } from "./legacy-import";
import { runCommand, type RunCommandIO } from "./run-command";

const input = {
  runId: "legacy-run",
  objective: "import",
  approvedBy: "user",
  approvedAt: "2026-09-16T00:00:00Z",
  expiresAt: "2026-09-17T00:00:00Z",
  sourceBranch: "feature/v3.2.3",
  headBranch: "feature/import-v3.2.3",
  reviewBaseSha: "a".repeat(40),
  mode: "pull_request" as const,
  allowedPaths: [".agents/**"],
  forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
  qualityGates: ["test"],
  acceptanceCriteria: ["done"],
  phases: [
    {
      id: "phase-1",
      name: "import",
      objective: "import",
      allowedPaths: [".agents/**"],
      qualityGates: ["test"],
      acceptanceCriteria: ["done"],
      stopConditions: ["fail"],
    },
  ],
};
const paths = {
  plan: "ai/runs/legacy-run/plan.json",
  review: "human/runs/legacy-run/plan-review.html",
  ai: "ai/runs/legacy-run",
  human: "human/runs/legacy-run",
  manifest: "ai/runs/legacy-run/manifest.json",
  approval: "ai/runs/legacy-run/approval.json",
};
function fake(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const io: RunCommandIO = {
    read: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
    writeExclusive: async (path, content) => {
      if (files.has(path)) throw new Error("EEXIST");
      files.set(path, content);
    },
    mkdir: async () => undefined,
  };
  return { files, io };
}
const marker = JSON.stringify({
  schemaVersion: 1,
  runId: "legacy-run",
  repositoryRealpath: "/repo",
  startSha: "a".repeat(40),
  taskBranch: "feature/import-v3.2.3",
  gitCommonDir: "/repo/.git",
});
const git = {
  run: async (args: string[]) =>
    ({
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --path-format=absolute --git-common-dir": "/repo/.git\n",
      "symbolic-ref --quiet --short HEAD": "feature/import-v3.2.3\n",
      "rev-parse HEAD": "b".repeat(40) + "\n",
      [`merge-base ${"a".repeat(40)} HEAD`]: "a".repeat(40) + "\n",
      remote: "origin\n",
      "remote get-url origin": "https://github.com/o289/new_schedule_app.git\n",
      [`diff --name-only -z ${"a".repeat(40)}...HEAD`]: "",
      "status --porcelain=v1 -z --untracked-files=all":
        "?? .agent-run-marker.json\0",
    })[args.join(" ")] ?? "",
};

describe("legacy import prepare", () => {
  it("writes exactly five artifacts after Git validation", async () => {
    const f = fake();
    await prepareLegacyImport("legacy-run", input, f.io, paths, {
      markerContent: marker,
      git,
    });
    expect([...f.files.keys()].sort()).toEqual(
      [
        paths.approval,
        paths.manifest,
        paths.plan,
        paths.review,
        `${paths.ai}/agent-plan.md`,
      ].sort(),
    );
  });
  it("rejects an existing artifact and a mismatched runId", async () => {
    await expect(
      prepareLegacyImport("other", input, fake().io, paths, {
        markerContent: marker,
        git,
      }),
    ).rejects.toThrow("runId");
    for (const output of [
      paths.plan,
      paths.review,
      `${paths.ai}/agent-plan.md`,
      paths.approval,
      paths.manifest,
    ]) {
      await expect(
        prepareLegacyImport(
          "legacy-run",
          input,
          fake({ [output]: "existing" }).io,
          paths,
          { markerContent: marker, git },
        ),
      ).rejects.toThrow("artifact");
    }
  });
  it("rejects Git branch and path violations", async () => {
    const badGit = {
      ...git,
      run: async (args: string[]) =>
        args.join(" ") === "symbolic-ref --quiet --short HEAD"
          ? "main\n"
          : git.run(args),
    };
    await expect(
      prepareLegacyImport("legacy-run", input, fake().io, paths, {
        markerContent: marker,
        git: badGit,
      }),
    ).rejects.toThrow("branch");
    await expect(
      prepareLegacyImport("legacy-run", input, fake().io, paths, {
        markerContent: marker,
        git,
        expectedWorktreeRoot: "/wrong-worktree",
      }),
    ).rejects.toThrow("worktree");
  });
  it("rejects expired and future approvals", async () => {
    await expect(
      prepareLegacyImport(
        "legacy-run",
        { ...input, expiresAt: "2020-01-01T00:00:00Z" },
        fake().io,
        paths,
        { markerContent: marker, git, now: new Date("2026-09-16T00:00:00Z") },
      ),
    ).rejects.toThrow("期限");
    await expect(
      prepareLegacyImport(
        "legacy-run",
        { ...input, approvedAt: "2026-09-17T00:00:00Z" },
        fake().io,
        paths,
        { markerContent: marker, git, now: new Date("2026-09-16T00:00:00Z") },
      ),
    ).rejects.toThrow();
  });
  it("runs prepare through run-command", async () => {
    const f = fake({
      "ai/runs/legacy-run/legacy-import-input.json": JSON.stringify(input),
      ".agent-run-marker.json": marker,
    });
    f.io.run = git.run;
    await runCommand("import-legacy-prepare", "legacy-run", "/repo", f.io);
    expect(f.files.has(paths.plan)).toBe(true);
    expect(f.files.has(paths.approval)).toBe(true);
    expect(f.files.has(paths.manifest)).toBe(true);
    expect(f.files.has(paths.review)).toBe(true);
    expect(f.files.has(`${paths.ai}/agent-plan.md`)).toBe(true);
  });
  it.each([
    "runId",
    "taskBranch",
    "startSha",
    "repositoryRealpath",
    "gitCommonDir",
  ])("rejects marker mismatch: %s", async (field) => {
    const changed = JSON.parse(marker) as Record<string, unknown>;
    changed[field] = field === "startSha" ? "c".repeat(40) : "wrong";
    await expect(
      prepareLegacyImport("legacy-run", input, fake().io, paths, {
        markerContent: JSON.stringify(changed),
        git,
      }),
    ).rejects.toThrow();
  });
  it("rejects HEAD/base, origin, remote and changed paths", async () => {
    const variants = [
      {
        name: "HEAD",
        override: (args: string[]) =>
          args.join(" ") === "rev-parse HEAD"
            ? "a".repeat(40) + "\n"
            : undefined,
      },
      {
        name: "ancestor",
        override: (args: string[]) =>
          args[0] === "merge-base" ? "c".repeat(40) + "\n" : undefined,
      },
      {
        name: "origin",
        override: (args: string[]) =>
          args.join(" ") === "remote get-url origin"
            ? "https://example.invalid/repo.git\n"
            : undefined,
      },
      {
        name: "remote",
        override: (args: string[]) =>
          args.join(" ") === "remote" ? "origin\nbackup\n" : undefined,
      },
      {
        name: "path",
        override: (args: string[]) =>
          args[0] === "diff" ? "outside.txt\0" : undefined,
      },
    ];
    for (const variant of variants) {
      const badGit = {
        run: async (args: string[]) => variant.override(args) ?? git.run(args),
      };
      await expect(
        prepareLegacyImport("legacy-run", input, fake().io, paths, {
          markerContent: marker,
          git: badGit,
        }),
      ).rejects.toThrow();
    }
  });
  it("checks both sides of a rename from NUL status output", async () => {
    const renameGit = {
      run: async (args: string[]) =>
        args[0] === "status"
          ? "R  .agents/new name\0.agents/old name\0"
          : git.run(args),
    };
    const f = fake();
    await prepareLegacyImport("legacy-run", input, f.io, paths, {
      markerContent: marker,
      git: renameGit,
    });
    expect(f.files.has(paths.plan)).toBe(true);
  });
});
