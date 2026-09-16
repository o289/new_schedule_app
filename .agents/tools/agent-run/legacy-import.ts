import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import {
  approvalInputSchema,
  approvalRecordSchema,
  validateApproval,
} from "./approval";
import { parsePlan } from "./plan-schema";
import { hashPlan } from "./plan-hash";
import {
  createPlanViewModel,
  renderPlanHtml,
  renderPlanMarkdown,
} from "./plan-render";
import type { RunCommandIO } from "./run-command";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const path = z.string().trim().min(1);
export const legacyImportInputSchema = z
  .object({
    runId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    objective: z.string().trim().min(1),
    approvedBy: z.string().trim().min(1),
    approvedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    sourceBranch: z.string().regex(/^feature\/v\d+\.\d+\.\d+$/),
    headBranch: z.string().regex(/^feature\/[A-Za-z0-9_-]+-v\d+\.\d+\.\d+$/),
    reviewBaseSha: sha,
    mode: z.literal("pull_request"),
    phases: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            objective: z.string(),
            allowedPaths: z.array(path),
            qualityGates: z.array(z.string()),
            acceptanceCriteria: z.array(z.string()),
            stopConditions: z.array(z.string()),
          })
          .strict(),
      )
      .min(1),
    allowedPaths: z.array(path).min(1),
    forbiddenPaths: z.array(path).min(1),
    qualityGates: z.array(z.string()).min(1),
    acceptanceCriteria: z.array(z.string()).min(1),
  })
  .strict();
export interface LegacyImportGitIO {
  run(args: string[]): Promise<string>;
}
function stop(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`STOP: ${message}`);
}
function matches(pathname: string, rule: string): boolean {
  if (rule === ".env*")
    return pathname === ".env" || pathname.startsWith(".env.");
  return rule.endsWith("/**")
    ? pathname === rule.slice(0, -3) || pathname.startsWith(rule.slice(0, -2))
    : pathname === rule;
}
function changedPaths(output: string, status = false): string[] {
  if (!output) return [];
  if (!output.endsWith("\0"))
    throw new Error("Git path output must be NUL terminated");
  const fields = output.slice(0, -1).split("\0");
  if (!status) return fields;
  const paths: string[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index]!;
    if (entry.length < 4) throw new Error("Malformed Git status output");
    paths.push(entry.slice(3));
    if (
      entry[0] === "R" ||
      entry[0] === "C" ||
      entry[1] === "R" ||
      entry[1] === "C"
    ) {
      const next = fields[index + 1];
      if (next === undefined) throw new Error("Malformed Git rename output");
      paths.push(next);
      index += 1;
    }
  }
  return paths;
}

async function validateGit(
  input: z.infer<typeof legacyImportInputSchema>,
  runId: string,
  markerContent: string,
  git: LegacyImportGitIO,
  expectedWorktreeRoot?: string,
): Promise<void> {
  const marker = z
    .object({
      schemaVersion: z.literal(1),
      runId: z.string(),
      repositoryRealpath: z.string(),
      startSha: sha,
      taskBranch: z.string(),
      gitCommonDir: z.string(),
    })
    .strict()
    .parse(JSON.parse(markerContent) as unknown);
  stop(marker.runId === runId, "markerのrunIdが不一致です");
  stop(
    marker.taskBranch === input.headBranch,
    "markerのtaskBranchが不一致です",
  );
  stop(marker.startSha === input.reviewBaseSha, "markerのstartShaが不一致です");
  const commonDir = (
    await git.run(["rev-parse", "--path-format=absolute", "--git-common-dir"])
  ).trim();
  stop(commonDir === marker.gitCommonDir, "gitCommonDirが不一致です");
  stop(
    dirname(commonDir) === marker.repositoryRealpath,
    "repositoryRealpathが不一致です",
  );
  const worktreeRoot = (await git.run(["rev-parse", "--show-toplevel"])).trim();
  stop(
    expectedWorktreeRoot === undefined || worktreeRoot === expectedWorktreeRoot,
    "worktree rootが不一致です",
  );
  stop(
    (await git.run(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim() ===
      input.headBranch,
    "現在branchがheadBranchと不一致です",
  );
  stop(
    (await git.run(["rev-parse", "HEAD"])).trim() !== input.reviewBaseSha,
    "HEADがreviewBaseShaと同一です",
  );
  stop(
    (await git.run(["merge-base", input.reviewBaseSha, "HEAD"])).trim() ===
      input.reviewBaseSha,
    "reviewBaseShaがHEADの祖先ではありません",
  );
  const remotes = (await git.run(["remote"]))
    .trim()
    .split("\n")
    .filter(Boolean);
  stop(
    remotes.length === 1 && remotes[0] === "origin",
    "origin以外のremoteが設定されています",
  );
  const origin = (await git.run(["remote", "get-url", "origin"])).trim();
  stop(
    [
      "https://github.com/o289/new_schedule_app.git",
      "git@github.com:o289/new_schedule_app.git",
    ].includes(origin),
    "originが固定リポジトリではありません",
  );
  const paths = [
    ...changedPaths(
      await git.run([
        "diff",
        "--name-only",
        "-z",
        `${input.reviewBaseSha}...HEAD`,
      ]),
    ),
    ...changedPaths(
      await git.run([
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ]),
      true,
    ),
  ];
  stop(
    paths.every(
      (changed) =>
        changed === ".agent-run-marker.json" ||
        input.allowedPaths.some((rule) => matches(changed, rule)),
    ),
    "変更pathがallowedPaths外です",
  );
}

export async function prepareLegacyImport(
  runId: string,
  raw: unknown,
  io: RunCommandIO,
  paths: {
    plan: string;
    review: string;
    ai: string;
    human: string;
    manifest: string;
    approval: string;
  },
  options: {
    markerContent: string;
    git: LegacyImportGitIO;
    expectedWorktreeRoot?: string;
    now?: Date;
  },
): Promise<void> {
  const input = legacyImportInputSchema.parse(raw);
  stop(input.runId === runId, "import runIdが不一致です");
  const approved = Date.parse(input.approvedAt),
    expires = Date.parse(input.expiresAt);
  stop(
    approved < expires &&
      expires - approved <= 7 * 86400000 &&
      (options?.now ?? new Date()).getTime() < expires,
    "approval期限が不正です",
  );
  await validateGit(
    input,
    runId,
    options.markerContent,
    options.git,
    options.expectedWorktreeRoot,
  );
  const outputs = [
    paths.plan,
    paths.review,
    paths.ai + "/agent-plan.md",
    paths.approval,
    paths.manifest,
  ];
  const existing = await Promise.all(
    outputs.map(async (output) => {
      try {
        await io.read(output);
        return output;
      } catch {
        return undefined;
      }
    }),
  );
  stop(
    existing.every((output) => output === undefined),
    "legacy import artifactが既に存在します",
  );
  const plan = parsePlan({
    schemaVersion: 2,
    planId: runId,
    runId,
    objective: input.objective,
    assumptions: [],
    openDecisions: [],
    phases: input.phases,
    allowedPaths: input.allowedPaths,
    forbiddenPaths: input.forbiddenPaths,
    apiChanges: [],
    dbChanges: [],
    dependencyChanges: [],
    permissionChanges: [],
    secretChanges: [],
    externalSideEffects: [],
    qualityGates: input.qualityGates,
    failurePolicy: "stop",
    limits: { maxRetries: 3, maxDurationMinutes: 120, maxCostYen: 0 },
    branch: { source: input.sourceBranch, worktree: "run", mode: input.mode },
    acceptanceCriteria: input.acceptanceCriteria,
  });
  const view = createPlanViewModel(plan),
    content = JSON.stringify(plan, null, 2) + "\n",
    planHash = hashPlan(plan);
  const approval = approvalInputSchema.parse({
    schemaVersion: 2,
    runId,
    plan: {
      path: paths.plan,
      sha256: createHash("sha256").update(content).digest("hex"),
    },
    planHash,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
  });
  validateApproval(approval, content, options?.now ?? new Date());
  const record = approvalRecordSchema.parse({ ...approval, completed: true });
  await io.mkdir(paths.ai);
  await io.mkdir(paths.human);
  await io.writeExclusive(paths.plan, content);
  await io.writeExclusive(paths.review, renderPlanHtml(view));
  await io.writeExclusive(
    paths.ai + "/agent-plan.md",
    renderPlanMarkdown(view),
  );
  await io.writeExclusive(
    paths.approval,
    JSON.stringify(record, null, 2) + "\n",
  );
  await io.writeExclusive(
    paths.manifest,
    JSON.stringify({ runId, planHash, bootstrapPrepared: true }) + "\n",
  );
}
