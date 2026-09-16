import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  executePublication,
  type GitCommandResult,
  type PublicationExecutorIO,
} from "./publication-executor.js";
import type { FixedPublicationIntent } from "./publication-policy.js";

const execute = promisify(execFile);
const hasGit = await execute("git", ["--version"])
  .then(() => true)
  .catch(() => false);
const realGitIt = it.skipIf(!hasGit);
const targetSha = "a".repeat(40);
const remoteSha = "b".repeat(40);
const repositoryUrl = "https://github.com/o289/new_schedule_app.git";

const successfulRun = {
  headSha: targetSha,
  headBranch: "feature/publication-v3.2.3",
  event: "push",
  status: "completed",
  conclusion: "success",
  workflowName: "CI",
  url: "https://github.com/o289/new_schedule_app/actions/runs/1",
  jobs: [
    {
      name: "型・テスト・書式の確認",
      status: "completed",
      conclusion: "success",
    },
  ],
};
const successfulPullRequest = {
  number: 10,
  head: "feature/publication-v3.2.3",
  base: "feature/v3.2.3",
  headSha: targetSha,
  state: "OPEN" as const,
  isDraft: false as const,
  isCrossRepository: false as const,
};

function intent(
  capability: "promote_ff_only" | "publish_approved_sha",
  mode: "push_only" | "pull_request" = "push_only",
): FixedPublicationIntent {
  const branch =
    mode === "push_only" ? "feature/v3.2.3" : "feature/publication-v3.2.3";
  return {
    capability,
    runId: "publication-run",
    planHash: "c".repeat(64),
    revision: 4,
    targetSha,
    startSha: "d".repeat(40),
    branch,
    ...(mode === "pull_request" ? { base: "feature/v3.2.3" } : {}),
    mode,
  };
}

function result(stdout = "", exitCode = 0): GitCommandResult {
  return { exitCode, stdout, stderr: "token=must-not-leak" };
}

function executorFixture(input: {
  remote?: string | undefined;
  originUrl?: string;
  remoteIsAncestor?: boolean;
  targetIsAncestor?: boolean;
  push?: () => Promise<GitCommandResult>;
  workflowRuns?: unknown;
  pullRequests?: unknown;
  createdPullRequest?: unknown;
}) {
  const calls: string[][] = [];
  const githubCalls: Array<{ operation: string; input: object }> = [];
  const io: PublicationExecutorIO = {
    git: async (args) => {
      calls.push([...args]);
      if (args[0] === "remote")
        return result(`${input.originUrl ?? repositoryUrl}\n`);
      if (args[0] === "check-ref-format") return result();
      if (args[0] === "ls-remote") {
        return result(
          input.remote === undefined
            ? ""
            : `${input.remote}\t${args[3] ?? ""}\n`,
        );
      }
      if (args[0] === "merge-base" && args[2] === input.remote) {
        return result("", input.remoteIsAncestor === false ? 1 : 0);
      }
      if (args[0] === "merge-base" && args[2] === targetSha) {
        return result("", input.targetIsAncestor === true ? 0 : 1);
      }
      if (args[0] === "push") return input.push?.() ?? result();
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    },
    github: {
      listWorkflowRuns: async (request) => {
        githubCalls.push({ operation: "runs", input: request });
        return input.workflowRuns ?? [successfulRun];
      },
      listPullRequests: async (request) => {
        githubCalls.push({ operation: "list", input: request });
        return input.pullRequests ?? [];
      },
      createPullRequest: async (request) => {
        githubCalls.push({ operation: "create", input: request });
        return input.createdPullRequest ?? successfulPullRequest;
      },
    },
  };
  return { io, calls, githubCalls };
}

describe("publication executor", () => {
  realGitIt("uses a temporary Git repository without a real push", async () => {
    const directory = await mkdtemp(join(tmpdir(), "publication-executor-"));
    try {
      await execute("git", ["init", "--quiet", directory]);
      const fixture = executorFixture({ remote: remoteSha });
      await executePublication(intent("promote_ff_only"), fixture.io);
      expect(fixture.calls).toContainEqual([
        "push",
        "origin",
        `${targetSha}:refs/heads/feature/v3.2.3`,
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    [undefined, true, false, true],
    [targetSha, true, false, false],
    [remoteSha, true, false, true],
  ] as const)(
    "allows missing, equal, or ancestor remote state (%s)",
    async (remote, remoteIsAncestor, targetIsAncestor, expectsPush) => {
      const fixture = executorFixture({
        remote,
        remoteIsAncestor,
        targetIsAncestor,
      });
      await expect(
        executePublication(intent("promote_ff_only"), fixture.io),
      ).resolves.toMatchObject({
        outcomeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(fixture.calls.some(([command]) => command === "push")).toBe(
        expectsPush,
      );
    },
  );

  it.each([
    [
      "ahead",
      { remote: remoteSha, remoteIsAncestor: false, targetIsAncestor: true },
    ],
    [
      "diverged",
      { remote: remoteSha, remoteIsAncestor: false, targetIsAncestor: false },
    ],
  ])("rejects %s remote history", async (_name, state) => {
    const fixture = executorFixture(state);
    await expect(
      executePublication(intent("promote_ff_only"), fixture.io),
    ).rejects.toThrow("publication rejected");
    expect(fixture.calls.some(([command]) => command === "push")).toBe(false);
  });

  it("uses fixed origin/refspec only and never allows force, delete, or tags", async () => {
    const fixture = executorFixture({ remote: remoteSha });
    await executePublication(intent("promote_ff_only"), fixture.io);
    expect(fixture.calls).toContainEqual([
      "remote",
      "get-url",
      "--all",
      "origin",
    ]);
    expect(fixture.calls).toContainEqual([
      "remote",
      "get-url",
      "--push",
      "--all",
      "origin",
    ]);
    expect(fixture.calls).toContainEqual([
      "push",
      "origin",
      `${targetSha}:refs/heads/feature/v3.2.3`,
    ]);
    for (const call of fixture.calls) {
      expect(call).not.toContain("--force");
      expect(call).not.toContain("--delete");
      expect(call.join(" ")).not.toContain("refs/tags/");
    }
  });

  it.each([
    "https://github.com/other/repository.git",
    `${repositoryUrl}\nhttps://github.com/o289/second.git`,
  ])("rejects an untrusted or ambiguous origin URL", async (originUrl) => {
    const fixture = executorFixture({ remote: remoteSha, originUrl });
    await expect(
      executePublication(intent("promote_ff_only"), fixture.io),
    ).rejects.toThrow("fixed repository");
    expect(fixture.calls.some(([command]) => command === "push")).toBe(false);
  });

  it("recovers an unknown push response by rechecking remote state without replaying it", async () => {
    let remote: string | undefined = remoteSha;
    let attempts = 0;
    const fixture = executorFixture({
      get remote() {
        return remote;
      },
      remoteIsAncestor: true,
      push: async () => {
        attempts += 1;
        remote = targetSha;
        throw new Error("response unknown");
      },
    });
    await expect(
      executePublication(intent("promote_ff_only"), fixture.io),
    ).rejects.toThrow("response unknown");
    await expect(
      executePublication(intent("promote_ff_only"), fixture.io),
    ).resolves.toBeTruthy();
    expect(attempts).toBe(1);
  });

  it.each([
    ["SHA", [{ ...successfulRun, headSha: remoteSha }]],
    ["branch", [{ ...successfulRun, headBranch: "feature/other-v3.2.3" }]],
    ["event", [{ ...successfulRun, event: "pull_request" }]],
    ["workflow", [{ ...successfulRun, workflowName: "other" }]],
    [
      "job",
      [
        {
          ...successfulRun,
          jobs: [
            {
              ...successfulRun.jobs[0],
              name: "unexpected job",
              conclusion: "failure",
            },
          ],
        },
      ],
    ],
  ])("rejects CI %s mismatch", async (_name, workflowRuns) => {
    const fixture = executorFixture({ remote: targetSha, workflowRuns });
    await expect(
      executePublication(intent("publish_approved_sha"), fixture.io),
    ).rejects.toThrow("CI evidence");
  });

  it("reuses only an exact normal pull request and creates one when none exists", async () => {
    const existing = executorFixture({
      remote: targetSha,
      pullRequests: [successfulPullRequest],
    });
    const existingResult = await executePublication(
      intent("publish_approved_sha", "pull_request"),
      existing.io,
    );
    expect(existing.githubCalls.map(({ operation }) => operation)).toEqual([
      "runs",
      "list",
    ]);
    expect(existingResult.pullRequestHash).toMatch(/^[a-f0-9]{64}$/);

    const created = executorFixture({ remote: targetSha });
    await executePublication(
      intent("publish_approved_sha", "pull_request"),
      created.io,
    );
    expect(created.githubCalls.map(({ operation }) => operation)).toEqual([
      "runs",
      "list",
      "create",
    ]);
    expect(created.githubCalls.at(-1)).toMatchObject({
      input: {
        repository: "github.com/o289/new_schedule_app",
        head: "feature/publication-v3.2.3",
        base: "feature/v3.2.3",
      },
    });
  });

  it("rejects an existing pull request with a different SHA and returns hashes only", async () => {
    const mismatch = executorFixture({
      remote: targetSha,
      pullRequests: [{ ...successfulPullRequest, headSha: remoteSha }],
    });
    await expect(
      executePublication(
        intent("publish_approved_sha", "pull_request"),
        mismatch.io,
      ),
    ).rejects.toThrow("existing pull request");

    const fixture = executorFixture({ remote: targetSha });
    const output = await executePublication(
      intent("publish_approved_sha", "pull_request"),
      fixture.io,
    );
    expect(JSON.stringify(output)).not.toContain("token=must-not-leak");
    expect(output.outcomeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.ciHash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.pullRequestHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
