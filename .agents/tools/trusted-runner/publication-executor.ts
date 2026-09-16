import { createHash } from "node:crypto";
import { z } from "zod";
import type { FixedPublicationIntent } from "./publication-policy.js";

const repository = "github.com/o289/new_schedule_app";
const requiredCiJobName = "型・テスト・書式の確認";
const originUrls = new Set([
  "https://github.com/o289/new_schedule_app.git",
  "git@github.com:o289/new_schedule_app.git",
]);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const workflowRunSchema = z
  .object({
    headSha: sha,
    headBranch: z.string().min(1),
    event: z.string().min(1),
    status: z.string().min(1),
    conclusion: z.string().nullable(),
    workflowName: z.string().min(1),
    url: z
      .string()
      .regex(
        /^https:\/\/github\.com\/o289\/new_schedule_app\/actions\/runs\/[0-9]+$/,
      ),
    jobs: z
      .array(
        z
          .object({
            name: z.string().min(1),
            status: z.string().min(1),
            conclusion: z.string().nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
const pullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    head: z.string().min(1),
    base: z.string().min(1),
    headSha: sha,
    state: z.literal("OPEN"),
    isDraft: z.literal(false),
    isCrossRepository: z.literal(false),
  })
  .strict();

export type GitCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};
export type PublicationExecutorIO = {
  git: (args: readonly string[]) => Promise<GitCommandResult>;
  github: {
    listWorkflowRuns: (input: {
      repository: typeof repository;
      workflow: "ci.yml";
      branch: string;
      commitSha: string;
      event: "push";
    }) => Promise<unknown>;
    listPullRequests: (input: {
      repository: typeof repository;
      head: string;
      base: string;
    }) => Promise<unknown>;
    createPullRequest: (input: {
      repository: typeof repository;
      head: string;
      base: string;
      title: string;
      body: string;
    }) => Promise<unknown>;
  };
};
export type PublicationExecution = {
  outcomeHash: string;
  ciHash?: string;
  pullRequestHash?: string;
  pushedSha: string;
  ci?: { status: "success"; url: string };
  pr?: {
    url: string;
    head: string;
    base: string;
    headSha: string;
    state: "OPEN";
    isDraft: false;
  };
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new Error(`publication rejected: ${message}`);
}

function fixedHash(value: Record<string, string | number | boolean>): string {
  return digest(JSON.stringify(value));
}

function isSuccessful(result: GitCommandResult): boolean {
  return result.exitCode === 0;
}

async function runGit(
  io: PublicationExecutorIO,
  args: readonly string[],
): Promise<GitCommandResult> {
  const result = await io.git(args);
  requireCondition(Number.isInteger(result.exitCode), "invalid git result");
  return result;
}

async function verifyOrigin(io: PublicationExecutorIO): Promise<void> {
  for (const args of [
    ["remote", "get-url", "--all", "origin"],
    ["remote", "get-url", "--push", "--all", "origin"],
  ]) {
    const result = await runGit(io, args);
    requireCondition(isSuccessful(result), "origin verification failed");
    const urls = result.stdout
      .trim()
      .split("\n")
      .filter((value) => value.length > 0);
    requireCondition(
      urls.length === 1 && originUrls.has(urls[0] ?? ""),
      "origin is not the fixed repository",
    );
  }
}

async function remoteSha(
  io: PublicationExecutorIO,
  branch: string,
): Promise<string | undefined> {
  const result = await runGit(io, [
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]);
  requireCondition(isSuccessful(result), "remote branch lookup failed");
  if (result.stdout.trim() === "") return undefined;
  const rows = result.stdout.trim().split("\n");
  const fields = rows[0]?.split(/\s+/);
  requireCondition(
    rows.length === 1 && fields?.[1] === `refs/heads/${branch}`,
    "remote branch is not unique",
  );
  return sha.parse(fields?.[0]);
}

async function ensureFastForward(
  io: PublicationExecutorIO,
  remote: string | undefined,
  target: string,
): Promise<"PUSHED" | "UNCHANGED"> {
  if (remote === undefined) return "PUSHED";
  if (remote === target) return "UNCHANGED";
  const remoteAncestor = await runGit(io, [
    "merge-base",
    "--is-ancestor",
    remote,
    target,
  ]);
  if (isSuccessful(remoteAncestor)) return "PUSHED";
  const targetAncestor = await runGit(io, [
    "merge-base",
    "--is-ancestor",
    target,
    remote,
  ]);
  requireCondition(
    !isSuccessful(targetAncestor),
    "remote branch is ahead of the approved SHA",
  );
  throw new Error(
    "publication rejected: remote branch diverges from approved SHA",
  );
}

async function promote(
  intent: FixedPublicationIntent,
  io: PublicationExecutorIO,
): Promise<"PUSHED" | "UNCHANGED"> {
  await verifyOrigin(io);
  const format = await runGit(io, [
    "check-ref-format",
    `refs/heads/${intent.branch}`,
  ]);
  requireCondition(isSuccessful(format), "canonical branch is invalid");
  const state = await ensureFastForward(
    io,
    await remoteSha(io, intent.branch),
    intent.targetSha,
  );
  if (state === "UNCHANGED") return state;
  const push = await runGit(io, [
    "push",
    "origin",
    `${intent.targetSha}:refs/heads/${intent.branch}`,
  ]);
  requireCondition(isSuccessful(push), "fast-forward push failed");
  return state;
}

async function verifyCi(
  intent: FixedPublicationIntent,
  io: PublicationExecutorIO,
): Promise<{ hash: string; url: string }> {
  const runs = z.array(workflowRunSchema).parse(
    await io.github.listWorkflowRuns({
      repository,
      workflow: "ci.yml",
      branch: intent.branch,
      commitSha: intent.targetSha,
      event: "push",
    }),
  );
  requireCondition(runs.length > 0, "CI evidence is unavailable");
  for (const run of runs) {
    const requiredJobs = run.jobs.filter(
      (job) => job.name === requiredCiJobName,
    );
    requireCondition(
      run.headSha === intent.targetSha &&
        run.headBranch === intent.branch &&
        run.event === "push" &&
        run.workflowName === "CI" &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        requiredJobs.length === 1 &&
        requiredJobs[0]?.status === "completed" &&
        requiredJobs[0]?.conclusion === "success",
      "CI evidence does not match the approved publication",
    );
  }
  return {
    hash: fixedHash({
      kind: "ci",
      count: runs.length,
      target: intent.targetSha,
    }),
    url: runs[0]!.url,
  };
}

async function publishPullRequest(
  intent: FixedPublicationIntent,
  io: PublicationExecutorIO,
): Promise<{ hash: string; pr?: PublicationExecution["pr"] }> {
  if (intent.mode === "push_only") return { hash: "" };
  const base = intent.base;
  requireCondition(base !== undefined, "pull request base is unavailable");
  const pullRequests = z.array(pullRequestSchema).parse(
    await io.github.listPullRequests({
      repository,
      head: intent.branch,
      base,
    }),
  );
  requireCondition(pullRequests.length <= 1, "multiple matching pull requests");
  const existing = pullRequests[0];
  if (existing) {
    requireCondition(
      existing.head === intent.branch &&
        existing.base === base &&
        existing.headSha === intent.targetSha,
      "existing pull request does not match the approved SHA",
    );
    return {
      hash: fixedHash({ kind: "pr", number: existing.number, reused: true }),
      pr: {
        url: `https://${repository}/pull/${existing.number}`,
        head: existing.head,
        base: existing.base,
        headSha: existing.headSha,
        state: "OPEN",
        isDraft: false,
      },
    };
  }
  const created = pullRequestSchema.parse(
    await io.github.createPullRequest({
      repository,
      head: intent.branch,
      base,
      title: `Publication ${intent.branch}`,
      body: "Created from an approved canonical publication intent.",
    }),
  );
  requireCondition(
    created.head === intent.branch &&
      created.base === base &&
      created.headSha === intent.targetSha,
    "created pull request does not match the approved SHA",
  );
  return {
    hash: fixedHash({ kind: "pr", number: created.number, reused: false }),
    pr: {
      url: `https://${repository}/pull/${created.number}`,
      head: created.head,
      base: created.base,
      headSha: created.headSha,
      state: "OPEN",
      isDraft: false,
    },
  };
}

export async function executePublication(
  intent: FixedPublicationIntent,
  io: PublicationExecutorIO,
): Promise<PublicationExecution> {
  const promotion = await promote(intent, io);
  const outcomeHash = fixedHash({
    kind: "promotion",
    result: promotion,
    target: intent.targetSha,
  });
  if (intent.capability === "promote_ff_only")
    return { outcomeHash, pushedSha: intent.targetSha };
  const ci = await verifyCi(intent, io);
  const pullRequest = await publishPullRequest(intent, io);
  return {
    outcomeHash,
    ciHash: ci.hash,
    pushedSha: intent.targetSha,
    ci: { status: "success", url: ci.url },
    ...(pullRequest.hash ? { pullRequestHash: pullRequest.hash } : {}),
    ...(pullRequest.pr ? { pr: pullRequest.pr } : {}),
  };
}
