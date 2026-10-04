import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const versionBranch = /^feature\/v\d+\.\d+\.\d+$/;
const featureBranch = /^feature\/[A-Za-z0-9][A-Za-z0-9_-]*-v(\d+\.\d+\.\d+)$/;

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function validateBranches(
  mode: "push_only" | "pull_request",
  head: string,
  base?: string,
): void {
  if (mode === "push_only") {
    if (!versionBranch.test(head) || base !== undefined)
      throw new Error("STOP: 版branchのpush_onlyにPR baseは指定できません");
    return;
  }
  const version = featureBranch.exec(head)?.[1];
  if (
    version === undefined ||
    (base !== undefined && base !== `feature/v${version}`)
  )
    throw new Error("STOP: 機能branchのPR先は同じバージョンに固定です");
}

export type CommandRunner = (
  program: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

export type PublicationResult =
  | { mode: "push_only"; branch: string; sha: string; ciUrl: string }
  | {
      mode: "pull_request";
      branch: string;
      base: string;
      sha: string;
      ciUrl: string;
      prUrl: string;
    };

const execFileAsync = promisify(execFile);
const defaultCommand: CommandRunner = async (program, args) => {
  try {
    return await execFileAsync(program, [...args], {
      cwd: process.cwd(),
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    const result = error as { stderr?: string; message?: string };
    throw new Error(
      `STOP: ${program}の実行に失敗しました。認証・環境・コマンド結果を確認してください: ${
        result.stderr?.trim() || result.message || "unknown error"
      }`,
    );
  }
};

function stop(message: string): never {
  throw new Error(`STOP: ${message}`);
}

function requiredLine(value: string, label: string): string {
  const result = value.trim();
  if (result === "" || result.includes("\n")) stop(`${label}を取得できません`);
  return result;
}

function publicationForBranch(branch: string) {
  if (versionBranch.test(branch)) return { mode: "push_only" as const, branch };
  const match = featureBranch.exec(branch);
  if (match) {
    return {
      mode: "pull_request" as const,
      branch,
      base: `feature/v${match[1]}`,
    };
  }
  stop(
    "作業branchは feature/vX.Y.Z または feature/<機能名>-vX.Y.Z にしてください",
  );
}

async function verify(command: CommandRunner): Promise<void> {
  await command("docker", [
    "compose",
    "-f",
    "compose.dev.yml",
    "run",
    "--rm",
    "application",
    "sh",
    "-c",
    "pnpm install --frozen-lockfile && pnpm verify:phase",
  ]);
}

async function prepare(command: CommandRunner) {
  const branch = requiredLine(
    (await command("git", ["branch", "--show-current"])).stdout,
    "branch",
  );
  const publication = publicationForBranch(branch);
  if ((await command("git", ["status", "--porcelain"])).stdout.trim() !== "") {
    stop("未コミットの変更があります。commitしてから公開してください");
  }
  const sha = requiredLine(
    (await command("git", ["rev-parse", "HEAD"])).stdout,
    "HEAD SHA",
  );
  if (!/^[a-f0-9]{40}$/.test(sha)) stop("HEAD SHAが不正です");
  const remote = requiredLine(
    (await command("git", ["remote", "get-url", "origin"])).stdout,
    "origin",
  );
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/.test(remote)) {
    stop("originはGitHubリポジトリに固定してください");
  }
  return { ...publication, sha };
}

type CiRun = { conclusion: string | null; url: string; headSha: string };

async function waitForCi(
  command: CommandRunner,
  branch: string,
  sha: string,
  attempts = 24,
): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await command("gh", [
      "run",
      "list",
      "--branch",
      branch,
      "--commit",
      sha,
      "--limit",
      "20",
      "--json",
      "conclusion,url,headSha",
    ]);
    const runs = JSON.parse(result.stdout) as CiRun[];
    const run = runs.find((item) => item.headSha === sha);
    if (run?.conclusion === "success") return run.url;
    if (run?.conclusion && run.conclusion !== "success") {
      stop(`GitHub Actionsが失敗しました: ${run.conclusion}`);
    }
    if (attempt + 1 < attempts)
      await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  stop("同一SHAのGitHub Actions CIが時間内に完了しませんでした");
}

async function prFor(
  command: CommandRunner,
  branch: string,
  base: string,
  sha: string,
): Promise<string> {
  const result = await command("gh", [
    "pr",
    "list",
    "--head",
    branch,
    "--base",
    base,
    "--state",
    "open",
    "--json",
    "url,headRefName,baseRefName,headRefOid,isDraft,state",
  ]);
  const prs = JSON.parse(result.stdout) as Array<{
    url: string;
    headRefName: string;
    baseRefName: string;
    headRefOid: string;
    isDraft: boolean;
    state: string;
  }>;
  if (prs.length > 1) stop("同じhead/baseのPRが複数あります");
  const existing = prs[0];
  const url = existing
    ? existing.url
    : requiredLine(
        (
          await command("gh", [
            "pr",
            "create",
            "--base",
            base,
            "--head",
            branch,
            "--title",
            `変更: ${branch.replace(/^feature\//, "")}`,
            "--body",
            "品質ゲートとGitHub Actions CIを通過した変更です。レビューとマージは人間が行います。",
          ])
        ).stdout,
        "PR URL",
      );
  const verified = JSON.parse(
    (
      await command("gh", [
        "pr",
        "view",
        url,
        "--json",
        "url,headRefName,baseRefName,headRefOid,isDraft,state",
      ])
    ).stdout,
  ) as {
    url: string;
    headRefName: string;
    baseRefName: string;
    headRefOid: string;
    isDraft: boolean;
    state: string;
  };
  if (
    verified.url !== url ||
    verified.headRefName !== branch ||
    verified.baseRefName !== base ||
    verified.headRefOid !== sha ||
    verified.state !== "OPEN" ||
    verified.isDraft
  ) {
    stop("通常PRの状態またはhead/base/SHAが期待値と一致しません");
  }
  return url;
}

export async function publish(
  command: CommandRunner = defaultCommand,
): Promise<PublicationResult> {
  const publication = await prepare(command);
  await verify(command);
  await command("gh", ["auth", "status", "--hostname", "github.com"]);
  await command("git", ["push", "origin", publication.branch]);
  const ciUrl = await waitForCi(command, publication.branch, publication.sha);
  if (publication.mode === "push_only") return { ...publication, ciUrl };
  const prUrl = await prFor(
    command,
    publication.branch,
    publication.base,
    publication.sha,
  );
  return { ...publication, ciUrl, prUrl };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  publish()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
