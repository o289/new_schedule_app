import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFile,
  realpath,
  open,
  unlink,
  mkdtemp,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { startRecordSchema, validateStart } from "./pr-agent-start.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repo = "github.com/o289/new_schedule_app";
const remoteUrls = new Set([
  "https://github.com/o289/new_schedule_app.git",
  "git@github.com:o289/new_schedule_app.git",
]);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);
const artifact = z.object({ path: nonempty, sha256: digest }).strict();
const passed = z
  .object({ status: z.literal("PASS"), evidence: artifact })
  .strict();
const optionalGate = z.discriminatedUnion("status", [
  passed,
  z.object({ status: z.literal("NOT_REQUIRED"), reason: nonempty }).strict(),
]);
const commonHandoffSchema = z
  .object({
    schemaVersion: z.literal(2),
    head: nonempty,
    headSha: sha,
    reviewBaseSha: sha,
    start: artifact,
    plan: artifact,
    implementation: artifact,
    allPhasesComplete: z.literal(true),
    quality: z
      .object({
        final: z.literal("PASS"),
        verifyPhase: passed,
        integration: optionalGate,
        e2e: optionalGate,
      })
      .strict(),
    changes: z
      .object({
        db: z.boolean(),
        dependencies: z.boolean(),
        configuration: z.boolean(),
        generated: z.boolean(),
      })
      .strict(),
    review: z
      .object({
        diffSha256: digest,
        classification: artifact,
        allDiffClassified: z.literal(true),
        unclassified: z.literal(0),
        safetyReview: artifact,
        noSecretsOrDebug: z.literal(true),
        noUnapprovedChanges: z.literal(true),
        destructiveMigrationApproved: z.literal(true),
        html: artifact,
      })
      .strict(),
  })
  .strict();
const versionBranch = /^feature\/v\d+\.\d+\.\d+$/;
const featureBranch = /^feature\/[A-Za-z0-9][A-Za-z0-9_-]*-v(\d+\.\d+\.\d+)$/;
const prDiffReviewSchema = z
  .object({
    diffSha256: digest,
    classification: artifact,
    allDiffClassified: z.literal(true),
    unclassified: z.literal(0),
  })
  .strict();
export const handoffSchema = z
  .discriminatedUnion("mode", [
    commonHandoffSchema.extend({
      mode: z.literal("push_only"),
      head: nonempty.regex(versionBranch),
    }),
    commonHandoffSchema
      .extend({
        mode: z.literal("pull_request"),
        head: nonempty.regex(featureBranch),
        base: nonempty.optional(),
        baseSha: sha,
        prReview: prDiffReviewSchema,
        title: nonempty.max(200),
        body: artifact,
      })
      .superRefine((input, context) => {
        if (
          input.base !== undefined &&
          input.base !== `feature/v${featureBranch.exec(input.head)?.[1]}`
        )
          context.addIssue({
            code: "custom",
            message: "headとPR baseのバージョンが不一致です",
            path: ["base"],
          });
      }),
  ])
  .transform((input) =>
    input.mode === "pull_request"
      ? { ...input, base: `feature/v${featureBranch.exec(input.head)?.[1]}` }
      : input,
  );
export type Handoff = z.infer<typeof handoffSchema>;
export interface PublishIO {
  run: (program: "git" | "gh", args: string[]) => Promise<string>;
  read: (path: string) => Promise<string>;
  bodyFile: (content: string) => Promise<string>;
  sleep: () => Promise<void>;
  report: (message: string) => void;
}
function requireCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new Error(`STOP: ${message}`);
}
export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
export function validateBranches(
  mode: "push_only" | "pull_request",
  head: string,
  base?: string,
): void {
  if (mode === "push_only") {
    requireCondition(
      versionBranch.test(head) && base === undefined,
      "版branchのpush_onlyにPR baseは指定できません",
    );
  } else {
    const version = featureBranch.exec(head)?.[1];
    requireCondition(
      version !== undefined &&
        (base === undefined || base === `feature/v${version}`),
      "機能branchのPR先は同じバージョンに固定です",
    );
  }
}
async function readArtifact(
  io: PublishIO,
  ref: z.infer<typeof artifact>,
): Promise<string> {
  requireCondition(
    ref.path.startsWith("docs/") && !ref.path.split("/").includes(".."),
    "証跡はdocs配下に置いてください",
  );
  const content = await io.read(ref.path);
  requireCondition(
    content.trim().length > 0 && sha256(content) === ref.sha256,
    `証跡のhashが不一致です: ${ref.path}`,
  );
  return content;
}
const prSchema = z.object({
  number: z.number().int().positive(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: sha,
  isDraft: z.boolean(),
  url: z.string().url(),
  state: z.string(),
  isCrossRepository: z.boolean(),
});
const runSchema = z.object({
  databaseId: z.number().int().positive(),
  headSha: sha,
  headBranch: z.string(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  workflowName: z.string(),
  url: z.string().url(),
});
const runFields =
  "databaseId,headSha,headBranch,event,status,conclusion,workflowName,url";
const prFields =
  "number,baseRefName,headRefName,headRefOid,isDraft,url,state,isCrossRepository";
async function findPr(
  io: PublishIO,
  handoff: Extract<Handoff, { mode: "pull_request" }>,
) {
  const prs = z
    .array(prSchema)
    .parse(
      JSON.parse(
        await io.run("gh", [
          "pr",
          "list",
          "--repo",
          repo,
          "--head",
          handoff.head,
          "--state",
          "all",
          "--limit",
          "100",
          "--json",
          prFields,
        ]),
      ),
    );
  requireCondition(prs.length < 100, "PR一覧が上限に達しています");
  requireCondition(
    prs.every(
      (pr) =>
        pr.baseRefName === handoff.base &&
        pr.headRefName === handoff.head &&
        !pr.isCrossRepository,
    ),
    "既存PRのbase/head/repositoryが異なります",
  );
  requireCondition(
    prs.every((pr) => pr.state === "OPEN" && !pr.isDraft),
    "閉じたPRまたはDraftがあります",
  );
  requireCondition(prs.length <= 1, "PRが重複しています");
  return prs[0];
}
async function remoteSha(
  io: PublishIO,
  branch: string,
  allowMissing = false,
): Promise<string | undefined> {
  const response = await io.run("git", [
    "ls-remote",
    "--heads",
    "origin",
    `refs/heads/${branch}`,
  ]);
  if (allowMissing && response.trim() === "") return undefined;
  const rows = response.trim().split("\n");
  const fields = rows[0]?.split(/\s+/);
  requireCondition(
    rows.length === 1 && fields?.[1] === `refs/heads/${branch}`,
    "remote branchが一意に存在しません",
  );
  return sha.parse(fields?.[0]);
}
async function localState(io: PublishIO, handoff: Handoff) {
  requireCondition(
    (await io.run("git", ["rev-parse", "--show-toplevel"])).trim() === root,
    "対象repositoryが違います",
  );
  requireCondition(
    (
      await io.run("git", ["status", "--porcelain=v1", "--untracked-files=all"])
    ).trim() === "",
    "未コミット変更があります",
  );
  requireCondition(
    (await io.run("git", ["symbolic-ref", "--short", "HEAD"])).trim() ===
      handoff.head,
    "headが変化しています",
  );
  requireCondition(
    (await io.run("git", ["rev-parse", "HEAD"])).trim() === handoff.headSha,
    "品質確認後にSHAが変化しています",
  );
  for (const args of [
    ["remote", "get-url", "--all", "origin"],
    ["remote", "get-url", "--push", "--all", "origin"],
  ]) {
    requireCondition(
      remoteUrls.has((await io.run("git", args)).trim()),
      "originのURLが未許可または複数です",
    );
  }
}
export async function verifyInputs(io: PublishIO, handoff: Handoff) {
  validateBranches(
    handoff.mode,
    handoff.head,
    handoff.mode === "pull_request" ? handoff.base : undefined,
  );
  await io.run("git", ["check-ref-format", `refs/heads/${handoff.head}`]);
  await localState(io, handoff);
  await readArtifact(io, handoff.plan);
  const start = startRecordSchema.parse(
    JSON.parse(await readArtifact(io, handoff.start)),
  );
  validateStart(start);
  requireCondition(
    start.head === handoff.head &&
      start.mode === handoff.mode &&
      start.reviewBaseSha === handoff.reviewBaseSha &&
      start.plan.path === handoff.plan.path &&
      start.plan.sha256 === handoff.plan.sha256,
    "開始記録と公開入力が一致しません",
  );
  const implementation = await readArtifact(io, handoff.implementation);
  requireCondition(
    implementation.includes(handoff.headSha),
    "実装引き継ぎのSHAが不一致です",
  );
  for (const gate of [
    handoff.quality.verifyPhase,
    handoff.quality.integration,
    handoff.quality.e2e,
  ]) {
    if (gate.status === "PASS") {
      const evidence = await readArtifact(io, gate.evidence);
      requireCondition(
        evidence.includes(handoff.headSha),
        "品質証跡に対象SHAがありません",
      );
    }
  }
  for (const ref of [
    handoff.review.classification,
    handoff.review.safetyReview,
    handoff.review.html,
  ])
    await readArtifact(io, ref);
  requireCondition(
    (
      await io.run("git", [
        "merge-base",
        handoff.reviewBaseSha,
        handoff.headSha,
      ])
    ).trim() === handoff.reviewBaseSha,
    "reviewBaseShaがheadの祖先ではありません",
  );
  const diffArgs = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--binary",
    "--full-index",
  ];
  const diff = await io.run("git", [
    ...diffArgs,
    `${handoff.reviewBaseSha}...${handoff.headSha}`,
    "--",
  ]);
  requireCondition(
    diff.length > 0 && sha256(diff) === handoff.review.diffSha256,
    "タスクの全diffと一致しません",
  );
  const changedPaths = (
    await io.run("git", [
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      `${handoff.reviewBaseSha}...${handoff.headSha}`,
      "--",
    ])
  )
    .split("\0")
    .filter(Boolean);
  requireCondition(
    changedPaths.length > 0 &&
      changedPaths.every((path) =>
        start.assessment.plannedFiles.includes(path),
      ),
    "開始時の予定にない変更ファイルがあります。計画へ戻してください",
  );
  const upstream = (
    await io.run("git", [
      "for-each-ref",
      "--format=%(upstream:short)",
      `refs/heads/${handoff.head}`,
    ])
  ).trim();
  requireCondition(
    upstream === "" ||
      upstream === `origin/${handoff.head}` ||
      (handoff.mode === "pull_request" &&
        upstream === `origin/${handoff.base}`),
    "追跡先が開始記録と矛盾しています",
  );
  if (handoff.mode === "push_only") return "";
  await io.run("git", ["check-ref-format", `refs/heads/${handoff.base}`]);
  requireCondition(
    (await remoteSha(io, handoff.base)) === handoff.baseSha,
    "baseが更新されています。再照合してください",
  );
  requireCondition(
    (
      await io.run("git", ["rev-parse", `refs/remotes/origin/${handoff.base}`])
    ).trim() === handoff.baseSha,
    "ローカルbaseが古い状態です。取得して再検証してください",
  );
  await readArtifact(io, handoff.prReview.classification);
  const prDiff = await io.run("git", [
    ...diffArgs,
    `${handoff.baseSha}...${handoff.headSha}`,
    "--",
  ]);
  requireCondition(
    prDiff.length > 0 && sha256(prDiff) === handoff.prReview.diffSha256,
    "PR全diffと一致しません",
  );
  const body = await readArtifact(io, handoff.body);
  for (const heading of [
    "目的",
    "ユーザーへの影響",
    "変更の全体像",
    "STEPごとの変更概要",
    "重要な変更とリスク",
    "契約・データへの影響",
    "検証結果",
    "Integration / E2Eの範囲",
    "レビュー推奨順序",
    "対象外・未確認・rollback",
  ]) {
    requireCondition(
      body.includes(`## ${heading}`),
      `PR本文に${heading}がありません`,
    );
  }
  return body;
}
async function getCi(io: PublishIO, handoff: Handoff) {
  const runs = z
    .array(runSchema)
    .parse(
      JSON.parse(
        await io.run("gh", [
          "run",
          "list",
          "--repo",
          repo,
          "--workflow",
          "ci.yml",
          "--branch",
          handoff.head,
          "--commit",
          handoff.headSha,
          "--event",
          "push",
          "--limit",
          "100",
          "--json",
          runFields,
        ]),
      ),
    );
  requireCondition(runs.length < 100, "CI一覧が上限に達しています");
  for (const run of runs)
    requireCondition(
      run.headSha === handoff.headSha &&
        run.headBranch === handoff.head &&
        run.event === "push" &&
        run.workflowName === "CI",
      "CIの対象SHA/branch/workflowが不一致です",
    );
  const latest = runs.sort((a, b) => b.databaseId - a.databaseId)[0];
  if (!latest) return undefined;
  const detail = runSchema
    .extend({
      jobs: z.array(
        z.object({
          name: z.string(),
          status: z.string(),
          conclusion: z.string().nullable(),
        }),
      ),
    })
    .parse(
      JSON.parse(
        await io.run("gh", [
          "run",
          "view",
          String(latest.databaseId),
          "--repo",
          repo,
          "--json",
          `${runFields},jobs`,
        ]),
      ),
    );
  requireCondition(
    detail.databaseId === latest.databaseId &&
      detail.headSha === handoff.headSha &&
      detail.headBranch === handoff.head &&
      detail.event === "push" &&
      detail.workflowName === "CI",
    "CI詳細が対象と不一致です",
  );
  if (detail.status !== "completed") return undefined;
  requireCondition(detail.conclusion === "success", "CIが成功していません");
  const required = detail.jobs.filter(
    (job) => job.name === "型・テスト・書式の確認",
  );
  requireCondition(
    required.length === 1 &&
      required.every(
        (job) => job.status === "completed" && job.conclusion === "success",
      ),
    "必須checkが成功していません",
  );
  return detail;
}
export type PublishResult =
  | { mode: "push_only"; head: string; headSha: string; ciUrl: string }
  | {
      mode: "pull_request";
      head: string;
      headSha: string;
      ciUrl: string;
      base: string;
      prUrl: string;
    };

export async function ensureFastForward(
  io: Pick<PublishIO, "run">,
  remoteCommit: string | undefined,
  headCommit: string,
): Promise<boolean> {
  if (remoteCommit === undefined) return true;
  if (remoteCommit === headCommit) return false;
  let ancestor: string;
  try {
    ancestor = (
      await io.run("git", ["merge-base", remoteCommit, headCommit])
    ).trim();
  } catch {
    throw new Error(
      "STOP: remote commitを確認できません。取得後に再検証してください",
    );
  }
  requireCondition(
    ancestor === remoteCommit,
    "remoteが先行または分岐しています。forceせず停止します",
  );
  return true;
}

export async function publish(
  raw: unknown,
  io: PublishIO,
  args: string[] = [],
): Promise<PublishResult> {
  requireCondition(args.length === 0, "引数は受け付けません");
  const parsed = handoffSchema.safeParse(raw);
  requireCondition(
    parsed.success,
    "公開入力はschemaVersion 2のmode別形式に更新してください",
  );
  const handoff = parsed.data;
  const body = await verifyInputs(io, handoff);
  if (handoff.mode === "pull_request") {
    const previous = await findPr(io, handoff);
    requireCondition(
      !previous || previous.headRefOid === handoff.headSha,
      "既存PRが異なるSHAです。公開内容を確認してください",
    );
  }
  const remoteHead = await remoteSha(io, handoff.head, true);
  const needsPush = await ensureFastForward(io, remoteHead, handoff.headSha);
  await localState(io, handoff);
  if (needsPush) {
    io.report(`push開始: ${handoff.head} (${handoff.headSha})`);
    try {
      await io.run("git", [
        "-c",
        "push.followTags=false",
        "-c",
        "remote.origin.mirror=false",
        "push",
        "--porcelain",
        "origin",
        `${handoff.headSha}:refs/heads/${handoff.head}`,
      ]);
    } catch {
      throw new Error(
        "STOP: pushに失敗または応答が不明です。remoteを確認して再実行してください。履歴は変更しません",
      );
    }
    io.report("push完了。以降の失敗時もbranchを削除しません。");
  } else {
    io.report("同一SHAがremoteに存在します。再pushを省略しCIを確認します。");
  }
  let ci: Awaited<ReturnType<typeof getCi>>;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    ci = await getCi(io, handoff);
    if (ci) break;
    io.report(`CI待機中 (${attempt + 1}/60)`);
    await io.sleep();
  }
  requireCondition(
    ci !== undefined,
    "CI未完了または未検出です。push済みの状態で停止します",
  );
  await verifyInputs(io, handoff);
  requireCondition(
    (await remoteSha(io, handoff.head)) === handoff.headSha,
    "push先のSHAが変わりました",
  );
  const confirmedCi = await getCi(io, handoff);
  requireCondition(
    confirmedCi !== undefined && confirmedCi.databaseId === ci.databaseId,
    "CIが再実行・変更されています",
  );
  if (handoff.mode === "push_only") {
    io.report(
      `push_only完了: origin/${handoff.head} (${handoff.headSha}) / CI: ${ci.url}`,
    );
    return {
      mode: handoff.mode,
      head: handoff.head,
      headSha: handoff.headSha,
      ciUrl: ci.url,
    };
  }
  const existing = await findPr(io, handoff);
  if (existing) {
    requireCondition(
      existing.headRefOid === handoff.headSha,
      "既存PRのSHAが不一致です",
    );
    io.report(`既存の通常PRを確認: ${existing.url} / CI: ${ci.url}`);
    return {
      mode: handoff.mode,
      head: handoff.head,
      headSha: handoff.headSha,
      base: handoff.base,
      ciUrl: ci.url,
      prUrl: existing.url,
    };
  }
  const finalBody = `${body}\n\n## CI公開証跡\n- workflow: CI\n- commit SHA: ${handoff.headSha}\n- 結果: PASS\n- ${ci.url}\n`;
  io.report("通常PR作成開始。応答不明時は再実行で既存PRを確認してください。");
  const bodyPath = await io.bodyFile(finalBody);
  const url = (
    await io.run("gh", [
      "pr",
      "create",
      "--repo",
      repo,
      "--base",
      handoff.base,
      "--head",
      handoff.head,
      "--title",
      handoff.title,
      "--body-file",
      bodyPath,
    ])
  ).trim();
  requireCondition(
    /^https:\/\/github\.com\/o289\/new_schedule_app\/pull\/\d+$/.test(url),
    "PR作成応答が不明です。再実行で確認してください",
  );
  io.report(`通常PR作成完了: ${url} / CI: ${ci.url}`);
  return {
    mode: handoff.mode,
    head: handoff.head,
    headSha: handoff.headSha,
    base: handoff.base,
    ciUrl: ci.url,
    prUrl: url,
  };
}

const execute = promisify(execFile);
async function main() {
  requireCondition(process.argv.length === 2, "引数は受け付けません");
  requireCondition(
    (await realpath(process.cwd())) === root &&
      fileURLToPath(import.meta.url) ===
        resolve(root, "tools/pr-agent-publish.ts"),
    "固定された作業ルートから実行してください",
  );
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "pr-agent-"));
  const io: PublishIO = {
    run: async (program, args) => {
      // Gitの環境変数による別repositoryへの切替、GH_HOSTによる宛先変更を防ぐ。
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            !key.startsWith("GIT_") &&
            !["GH_HOST", "GH_REPO", "GH_DEBUG"].includes(key),
        ),
      );
      const output = await execute(program, args, {
        cwd: root,
        env: {
          ...env,
          GH_HOST: "github.com",
          GH_PROMPT_DISABLED: "1",
          GIT_TERMINAL_PROMPT: "0",
        },
        maxBuffer: 128 * 1024 * 1024,
        timeout: 120_000,
      });
      return output.stdout;
    },
    read: async (path) => {
      const actual = await realpath(resolve(root, path));
      const within = relative(resolve(root, "docs"), actual);
      requireCondition(
        within !== "" && !within.startsWith("..") && !isAbsolute(within),
        "証跡がdocsの外を参照しています",
      );
      return readFile(actual, "utf8");
    },
    bodyFile: async (content) => {
      const path = resolve(temporaryDirectory, "body.md");
      await writeFile(path, content, { mode: 0o600 });
      return path;
    },
    sleep: () => new Promise((done) => setTimeout(done, 10_000)),
    report: (message) => console.log(message),
  };
  const lockPath = resolve(root, "docs/pr-agent-publish.lock");
  try {
    const lock = await open(lockPath, "wx");
    try {
      await publish(
        JSON.parse(await io.read("docs/pr-agent-handoff.json")),
        io,
      );
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    // 子processの生出力にはcredentialが含まれうるため出さない。
    console.error(
      error instanceof Error && error.message.startsWith("STOP:")
        ? error.message
        : "STOP: 入力・外部コマンドの確認に失敗しました。公開済み状態と証跡を確認してください。",
    );
    process.exitCode = 1;
  }
}
