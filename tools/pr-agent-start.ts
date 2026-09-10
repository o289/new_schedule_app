import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const nonempty = z.string().trim().min(1);
const uniqueNames = z
  .array(nonempty)
  .refine(
    (names) => new Set(names).size === names.length,
    "重複した名前があります",
  );
export const assessmentSchema = z
  .object({
    phaseCount: z.number().int().nonnegative(),
    plannedFiles: uniqueNames.min(1),
    authenticationChanged: z.boolean(),
    dbModels: uniqueNames,
    dependentDbModels: z.boolean(),
    directImplementation: z.boolean(),
  })
  .strict()
  .refine(
    (input) => !input.dependentDbModels || input.dbModels.length >= 2,
    "DB依存関係には2モデル以上が必要です",
  );
export function classifyWork(
  raw: z.infer<typeof assessmentSchema>,
): "small" | "medium" | "large" {
  const assessment = assessmentSchema.parse(raw);
  const isLarge =
    assessment.phaseCount >= 5 ||
    assessment.plannedFiles.length >= 100 ||
    (assessment.phaseCount >= 3 &&
      (assessment.authenticationChanged ||
        (assessment.dbModels.length >= 2 && assessment.dependentDbModels)));
  if (isLarge) return "large";
  check(
    assessment.directImplementation === (assessment.phaseCount === 0),
    "直接実装は0フェーズ、計画ありは1フェーズ以上で記録します",
  );
  return assessment.directImplementation ? "small" : "medium";
}
const planRef = z
  .object({ path: nonempty, sha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const startInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    approved: z.literal(true),
    assessment: assessmentSchema,
    size: z.enum(["small", "medium", "large"]),
    mode: z.enum(["push_only", "pull_request"]),
    sourceBranch: z.string().regex(/^feature\/v\d+\.\d+\.\d+$/),
    head: nonempty,
    slug: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
      .optional(),
    reviewBaseSha: sha,
    plan: planRef,
  })
  .strict();
export const startRecordSchema = startInputSchema.extend({
  completed: z.literal(true),
});
export type StartInput = z.infer<typeof startInputSchema>;
export interface StartIO {
  run: (args: string[]) => Promise<string>;
  read: (path: string) => Promise<string>;
}
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`STOP: ${message}`);
}
export function validateStart(input: StartInput): void {
  const size = classifyWork(input.assessment);
  check(input.size === size, "規模と判定材料が一致しません");
  const expectedMode = size === "large" ? "pull_request" : "push_only";
  check(input.mode === expectedMode, "規模と公開モードが一致しません");
  if (size === "large") {
    check(input.slug !== undefined, "大規模変更にはslugが必要です");
    check(
      input.head ===
        `feature/${input.slug}-${input.sourceBranch.slice("feature/".length)}`,
      "headのslugまたはバージョンが一致しません",
    );
  } else {
    check(
      input.slug === undefined && input.head === input.sourceBranch,
      "小・中規模は版branchのまま実装します",
    );
  }
}
export async function startTask(
  raw: unknown,
  io: StartIO,
  args: string[] = [],
) {
  check(args.length === 0, "引数は受け付けません");
  const input = startInputSchema.parse(raw);
  validateStart(input);
  check(
    (await io.run(["rev-parse", "--show-toplevel"])).trim() === root,
    "対象repositoryが違います",
  );
  for (const options of [
    ["remote", "get-url", "--all", "origin"],
    ["remote", "get-url", "--push", "--all", "origin"],
  ]) {
    check(
      [
        "https://github.com/o289/new_schedule_app.git",
        "git@github.com:o289/new_schedule_app.git",
      ].includes((await io.run(options)).trim()),
      "originが未許可または複数です",
    );
  }
  const beforeStart = async () => {
    check(
      (
        await io.run(["status", "--porcelain=v1", "--untracked-files=all"])
      ).trim() === "",
      "作業ツリーがdirtyです",
    );
    check(
      (await io.run(["symbolic-ref", "--short", "HEAD"])).trim() ===
        input.sourceBranch,
      "開始元branchが一致しません",
    );
    check(
      (await io.run(["rev-parse", "HEAD"])).trim() === input.reviewBaseSha,
      "実装開始SHAが変化しています",
    );
  };
  await beforeStart();
  check(
    input.plan.path.startsWith("docs/") &&
      !input.plan.path.split("/").includes(".."),
    "計画はdocs配下に置いてください",
  );
  const plan = await io.read(input.plan.path);
  check(
    plan.trim().length > 0 &&
      createHash("sha256").update(plan).digest("hex") === input.plan.sha256,
    "承認済み計画のhashが不一致です",
  );
  await io.run(["check-ref-format", `refs/heads/${input.head}`]);
  if (input.mode === "pull_request") {
    const local = await io.run([
      "for-each-ref",
      "--format=%(refname)",
      `refs/heads/${input.head}`,
    ]);
    check(local.trim() === "", "同名local branchが存在します");
    const remote = await io.run([
      "ls-remote",
      "--heads",
      "origin",
      `refs/heads/${input.head}`,
    ]);
    check(remote.trim() === "", "同名remote branchが存在します");
    await beforeStart();
    await io.run([
      "switch",
      "--no-track",
      "-c",
      input.head,
      input.reviewBaseSha,
    ]);
  }
  check(
    (await io.run(["symbolic-ref", "--short", "HEAD"])).trim() === input.head,
    "開始後のbranchが不一致です",
  );
  check(
    (await io.run(["rev-parse", "HEAD"])).trim() === input.reviewBaseSha,
    "開始後のSHAが不一致です",
  );
  return startRecordSchema.parse({ ...input, completed: true });
}

const execute = promisify(execFile);
async function main() {
  check(process.argv.length === 2, "引数は受け付けません");
  check(
    (await realpath(process.cwd())) === root,
    "repositoryルートから実行してください",
  );
  const read = async (path: string) => {
    const actual = await realpath(resolve(root, path));
    const within = relative(resolve(root, "docs"), actual);
    check(
      within !== "" && !within.startsWith("..") && !isAbsolute(within),
      "docs外への参照です",
    );
    return readFile(actual, "utf8");
  };
  const input: unknown = JSON.parse(
    await read("docs/pr-agent-start-input.json"),
  );
  // 記録の上書きを拒否する。異常終了時も開始SHAを推測して再作成しない。
  const record = await open(
    resolve(root, "docs/pr-agent-start-record.json"),
    "wx",
  );
  try {
    const result = await startTask(input, {
      read,
      run: async (args) => {
        const env = Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.startsWith("GIT_"),
          ),
        );
        return (
          await execute("git", args, {
            cwd: root,
            env: { ...env, GIT_TERMINAL_PROMPT: "0" },
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
          })
        ).stdout;
      },
    });
    await record.writeFile(JSON.stringify(result, null, 2) + "\n");
    console.log(
      `開始記録を保存: ${result.size} / ${result.head} / ${result.reviewBaseSha}`,
    );
  } finally {
    await record.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error && error.message.startsWith("STOP:")
        ? error.message
        : "STOP: 開始入力またはGit確認に失敗しました。branchと開始記録を確認してください。",
    );
    process.exitCode = 1;
  }
}
