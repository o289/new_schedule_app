import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
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
import { startRecordV2Schema, validateStart } from "../pr-agent-start.js";
import { handoffSchema, sha256 } from "../pr-agent-publish.js";
import { CanonicalOrchestrator } from "./canonical-orchestrator";
import { CanonicalStateStore } from "./state-store";

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
const gate = z
  .object({
    status: z.literal("PASS"),
    evidence: z
      .object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
  })
  .strict();
const optionalGate = z.union([
  gate,
  z
    .object({ status: z.literal("NOT_REQUIRED"), reason: z.string().min(1) })
    .strict(),
]);
export const legacyFinalizeInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string(),
    verifiedSha: sha,
    quality: z
      .object({
        node: z.literal("22.23.1"),
        pnpm: z.literal("11.20.0"),
        rules: z.literal("PASS"),
        typecheckFrontend: z.literal("PASS"),
        typecheckBackend: z.literal("PASS"),
        typecheckTools: z.literal("PASS"),
        verifyPhase: z.literal("PASS"),
        vitestPassed: z.number().int().positive(),
        vitestSkipped: z.number().int().min(0),
        vitestFailed: z.literal(0),
        integration: optionalGate,
        e2e: optionalGate,
      })
      .strict(),
    noSecretsOrDebug: z.literal(true),
    noUnapprovedChanges: z.literal(true),
    destructiveMigrationApproved: z.literal(true),
  })
  .strict();
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
export function containsSecretLikeValue(diff: string): boolean {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .some((line) => {
      const codeLine = line.includes("<") || line.includes(">") ? "" : line;
      return (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}/i.test(
          line,
        ) ||
        /\b(?:password|secret|token)\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,}["']?/i.test(
          codeLine,
        )
      );
    });
}
type DiffClassification =
  | { path: string; scope: "phase"; phaseId: string; matchedRule: string }
  | { path: string; scope: "common"; matchedRule: string };

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

export async function finalizeLegacyImport(
  runId: string,
  raw: unknown,
  io: RunCommandIO,
  paths: ReturnType<typeof import("./run-paths").runPaths>,
  root: string,
  git: LegacyImportGitIO,
  now = new Date(),
): Promise<void> {
  const input = legacyFinalizeInputSchema.parse(raw);
  stop(input.runId === runId, "finalize runIdが不一致です");
  const planText = await io.read(paths.plan),
    approvalText = await io.read(paths.approval),
    implementation = await io.read(paths.ai + "/agent-plan.md");
  const bootstrapInput = legacyImportInputSchema.parse(
    JSON.parse(
      await io.read(paths.ai + "/legacy-import-input.json"),
    ) as unknown,
  );
  stop(bootstrapInput.runId === runId, "bootstrap input runIdが不一致です");
  const plan = parsePlan(JSON.parse(planText) as unknown),
    view = createPlanViewModel(plan);
  stop(plan.runId === runId, "plan runIdが不一致です");
  const approval = approvalRecordSchema.parse(
    JSON.parse(approvalText) as unknown,
  );
  validateApproval(approval, planText, now);
  stop(approval.planHash === hashPlan(plan), "approval hashが不一致です");
  stop(
    implementation === renderPlanMarkdown(view),
    "agent-plan hashが不一致です",
  );
  const markerContent = await io.read(".agent-run-marker.json");
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
  stop(
    marker.runId === runId &&
      marker.taskBranch === bootstrapInput.headBranch &&
      marker.startSha === bootstrapInput.reviewBaseSha &&
      plan.branch.source === bootstrapInput.sourceBranch &&
      plan.branch.mode === bootstrapInput.mode,
    "markerが不正です",
  );
  const head = (await git.run(["rev-parse", "HEAD"])).trim();
  stop(head === input.verifiedSha, "verifiedShaとHEADが不一致です");
  stop(
    (await git.run(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim() ===
      marker.taskBranch,
    "branchが不一致です",
  );
  const common = (
    await git.run(["rev-parse", "--path-format=absolute", "--git-common-dir"])
  ).trim();
  stop(
    common === marker.gitCommonDir &&
      dirname(common) === marker.repositoryRealpath,
    "Git common dirが不一致です",
  );
  stop(
    (await git.run(["rev-parse", "--show-toplevel"])).trim() === root,
    "worktree rootが不一致です",
  );
  const branch = (
    await git.run(["symbolic-ref", "--quiet", "--short", "HEAD"])
  ).trim();
  stop(
    branch === bootstrapInput.headBranch &&
      plan.branch.source === bootstrapInput.sourceBranch,
    "branch/inputが不一致です",
  );
  stop(
    (await git.run(["merge-base", marker.startSha, "HEAD"])).trim() ===
      marker.startSha,
    "reviewBaseが祖先ではありません",
  );
  const status = await git.run([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  stop(
    status === "" || status === "?? .agent-run-marker.json\0",
    "tracked dirtyまたは不正untrackedです",
  );
  const diffPathsOutput = await git.run([
    "diff",
    "--name-only",
    "-z",
    `${marker.startSha}...${input.verifiedSha}`,
  ]);
  const diffPaths = diffPathsOutput
    ? diffPathsOutput.slice(0, -1).split("\0")
    : [];
  const diff = await git.run([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--binary",
    "--full-index",
    `${marker.startSha}...${input.verifiedSha}`,
    "--",
  ]);
  stop(
    diffPaths.every((changed) =>
      plan.allowedPaths.some((rule) => matches(changed, rule)),
    ),
    "変更pathがallowedPaths外です",
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
    "originが不正です",
  );
  const baseSha = (await git.run(["rev-parse", plan.branch.source])).trim();
  stop(/^[a-f0-9]{40}$/.test(baseSha), "baseShaが不正です");
  stop(
    (
      await git.run(["rev-parse", `refs/remotes/origin/${plan.branch.source}`])
    ).trim() === baseSha,
    "baseShaがorigin trackingと不一致です",
  );
  stop(!containsSecretLikeValue(diff), "秘密らしい値を検出しました");
  stop(
    input.quality.vitestFailed === 0 &&
      input.noSecretsOrDebug &&
      input.noUnapprovedChanges &&
      input.destructiveMigrationApproved,
    "品質証跡が不正です",
  );
  for (const gate of [input.quality.integration, input.quality.e2e]) {
    if (gate.status === "PASS") {
      stop(
        gate.evidence.path.startsWith(`${paths.runtime}/evidence/`),
        "品質evidence pathがrun専用ではありません",
      );
      const evidence = await io.read(gate.evidence.path);
      stop(
        sha256(evidence) === gate.evidence.sha256,
        "品質evidence hashが不一致です",
      );
    }
  }
  const evidenceDir = `${paths.runtime}/evidence`,
    qualityPath = `${evidenceDir}/quality.json`,
    classificationPath = `${evidenceDir}/diff-classification.json`,
    safetyPath = `${evidenceDir}/safety-review.json`,
    bodyPath = `${evidenceDir}/pr-body.md`,
    htmlPath = `${evidenceDir}/pr-review.html`;
  const outputPaths = [
    paths.start,
    paths.events,
    paths.runtime + "/requests/publication-handoff.json",
    qualityPath,
    classificationPath,
    safetyPath,
    bodyPath,
    htmlPath,
  ];
  for (const output of outputPaths) {
    try {
      await io.read(output);
      throw new Error("STOP: finalize artifactが既に存在します");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("STOP:"))
        throw error;
    }
  }
  const uniqueDiffPaths = [...new Set(diffPaths)];
  stop(uniqueDiffPaths.length > 0, "変更pathがありません");
  const assessment = {
    phaseCount: 5,
    plannedFiles: uniqueDiffPaths,
    authenticationChanged: false,
    dbModels: [],
    dependentDbModels: false,
    directImplementation: false,
  };
  const versionSuffix = bootstrapInput.sourceBranch.slice("feature/".length);
  const slug = bootstrapInput.headBranch.slice(
    "feature/".length,
    -versionSuffix.length - 1,
  );
  const start = startRecordV2Schema.parse({
    schemaVersion: 2,
    approved: true,
    assessment,
    size: "large",
    mode: "pull_request",
    sourceBranch: plan.branch.source,
    head: marker.taskBranch,
    slug,
    reviewBaseSha: marker.startSha,
    plan: {
      runId,
      planHash: hashPlan(plan),
      path: paths.plan,
      sha256: sha256(planText),
    },
    approval: {
      runId,
      planHash: approval.planHash,
      path: paths.approval,
      sha256: sha256(approvalText),
    },
    implementation: {
      path: paths.ai + "/agent-plan.md",
      sha256: sha256(implementation),
    },
    completed: true,
  });
  validateStart(start);
  const classification: DiffClassification[] = uniqueDiffPaths.map(
    (changed) => {
      const phase = plan.phases.find((item) =>
        item.allowedPaths.some((rule) => matches(changed, rule)),
      );
      if (phase) {
        const matchedRule = phase.allowedPaths.find((rule) =>
          matches(changed, rule),
        );
        stop(matchedRule !== undefined, "phaseの変更path ruleが不明です");
        return {
          path: changed,
          scope: "phase",
          phaseId: phase.id,
          matchedRule,
        };
      }
      const matchedRule = plan.allowedPaths.find((rule) =>
        matches(changed, rule),
      );
      stop(matchedRule !== undefined, "変更pathを分類できません");
      return { path: changed, scope: "common", matchedRule };
    },
  );
  stop(
    classification.every((item) =>
      item.scope === "common"
        ? plan.allowedPaths.some(
            (rule) => rule === item.matchedRule && matches(item.path, rule),
          )
        : plan.phases.some(
            (phase) =>
              phase.id === item.phaseId &&
              phase.allowedPaths.includes(item.matchedRule) &&
              matches(item.path, item.matchedRule),
          ),
    ),
    "diff classificationが不正です",
  );
  const qualityContent = JSON.stringify(input.quality) + "\n",
    classificationContent =
      JSON.stringify({
        diffSha256: sha256(diff),
        classifications: classification,
        unclassified: 0,
      }) + "\n",
    safetyContent =
      JSON.stringify({ noSecretsOrDebug: true, noUnapprovedChanges: true }) +
      "\n",
    bodyContent = `# ${plan.objective}\n\nDiff SHA256: ${sha256(diff)}\n`,
    htmlContent = `<html><body><pre>${diff.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre></body></html>\n`;
  const artifact = (path: string, content: string) => ({
    path,
    sha256: sha256(content),
  });
  const handoff = handoffSchema.parse({
    schemaVersion: 2,
    mode: "pull_request",
    head: marker.taskBranch,
    headSha: input.verifiedSha,
    reviewBaseSha: marker.startSha,
    start: artifact(paths.start, JSON.stringify(start, null, 2) + "\n"),
    plan: artifact(paths.plan, planText),
    implementation: artifact(paths.ai + "/agent-plan.md", implementation),
    allPhasesComplete: true,
    quality: {
      final: "PASS",
      verifyPhase: {
        status: "PASS",
        evidence: artifact(qualityPath, qualityContent),
      },
      integration: input.quality.integration,
      e2e: input.quality.e2e,
    },
    changes: {
      db: false,
      dependencies: false,
      configuration: false,
      generated: false,
    },
    review: {
      diffSha256: sha256(diff),
      classification: artifact(classificationPath, classificationContent),
      allDiffClassified: true,
      unclassified: 0,
      safetyReview: artifact(safetyPath, safetyContent),
      noSecretsOrDebug: true,
      noUnapprovedChanges: true,
      destructiveMigrationApproved: true,
      html: artifact(htmlPath, htmlContent),
    },
    prReview: {
      diffSha256: sha256(diff),
      classification: artifact(classificationPath, classificationContent),
      allDiffClassified: true,
      unclassified: 0,
    },
    base: plan.branch.source,
    baseSha,
    title: plan.objective,
    body: artifact(bodyPath, bodyContent),
  });
  await io.mkdir(evidenceDir);
  await io.writeExclusive(paths.start, JSON.stringify(start, null, 2) + "\n");
  await io.writeExclusive(qualityPath, qualityContent);
  await io.writeExclusive(classificationPath, classificationContent);
  await io.writeExclusive(safetyPath, safetyContent);
  await io.writeExclusive(bodyPath, bodyContent);
  await io.writeExclusive(htmlPath, htmlContent);
  await io.writeExclusive(
    paths.runtime + "/requests/publication-handoff.json",
    JSON.stringify(handoff, null, 2) + "\n",
  );
  const orchestrator = new CanonicalOrchestrator(
    new CanonicalStateStore(resolve(root, paths.events)),
    runId,
    {
      planHash: hashPlan(plan),
      phases: plan.phases.map(({ id }) => ({ id })),
      mode: "pull_request",
    },
  );
  await orchestrator.prepare();
  await orchestrator.approve();
  await orchestrator.ready();
  for (const phase of plan.phases) {
    await orchestrator.startPhase(phase.id);
    await orchestrator.beginVerify();
    await orchestrator.verificationPassed({
      phaseId: phase.id,
      evidenceHash: sha256(`${qualityContent}${phase.id}${input.verifiedSha}`),
      verifiedSha: input.verifiedSha,
      gatesPassed: true,
    });
  }
}
