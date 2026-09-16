import { execFile as execFileCallback } from "node:child_process";
import { mkdir, lstat, realpath, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const execFile = promisify(execFileCallback);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const runIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const worktreeInputSchema = z
  .object({
    root: z.string().trim().min(1),
    runId: runIdSchema,
    startSha: sha,
    sourceBranch: z
      .string()
      .trim()
      .min(1)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
      .refine((value) => !value.includes("..") && !value.startsWith("-")),
  })
  .strict();
export const worktreeMarkerSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: runIdSchema,
    repositoryRealpath: z.string().min(1),
    startSha: sha,
    taskBranch: z.string().regex(/^agent-run\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
    gitCommonDir: z.string().min(1),
  })
  .strict();
export type WorktreeMarker = z.infer<typeof worktreeMarkerSchema>;
export interface GitIO {
  run: (args: string[], cwd?: string) => Promise<string>;
  isAllowedOrigin?: (origin: string) => boolean;
  writeMarker?: (path: string, content: string) => Promise<void>;
}
export interface WorktreeInput {
  root: string;
  runId: string;
  startSha: string;
  sourceBranch: string;
}
export interface WorktreeResult {
  path: string;
  branch: string;
  marker: WorktreeMarker;
}
const allowedOrigins = [
  "https://github.com/o289/new_schedule_app.git",
  "git@github.com:o289/new_schedule_app.git",
];
function stop(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`STOP: ${message}`);
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT"
      ? false
      : (() => {
          throw error;
        })();
  }
}
async function checkClean(input: WorktreeInput, io: GitIO): Promise<void> {
  stop(
    (
      await io.run(
        ["status", "--porcelain=v1", "--untracked-files=all"],
        input.root,
      )
    ).trim() === "",
    "primary checkoutがdirtyです",
  );
  stop(
    (await io.run(["symbolic-ref", "--short", "HEAD"], input.root)).trim() ===
      input.sourceBranch,
    "primary branchが不一致です",
  );
  stop(
    (await io.run(["rev-parse", "HEAD"], input.root)).trim() === input.startSha,
    "primary SHAが不一致です",
  );
  const origins = [
    await io.run(["remote", "get-url", "--all", "origin"], input.root),
    await io.run(
      ["remote", "get-url", "--push", "--all", "origin"],
      input.root,
    ),
  ];
  origins.forEach((origin) =>
    stop(
      (
        io.isAllowedOrigin ??
        ((value: string) => allowedOrigins.includes(value))
      )(origin.trim()),
      "originが未許可です",
    ),
  );
}
export async function createWorktree(
  raw: WorktreeInput,
  io: GitIO = {
    run: async (args, cwd) => (await execFile("git", args, { cwd })).stdout,
  },
): Promise<WorktreeResult> {
  const input = worktreeInputSchema.parse(raw);
  const root = await realpath(input.root);
  stop(
    (await realpath(
      (await io.run(["rev-parse", "--show-toplevel"], root)).trim(),
    )) === root,
    "対象repository rootが不一致です",
  );
  const path = resolve(root, ".agent-runs", "worktrees", input.runId);
  const branch = `agent-run/${input.runId}`;
  stop(
    isAbsolute(input.root) && !relative(root, path).startsWith(".."),
    "worktree pathが不正です",
  );
  await checkClean({ ...input, root }, io);
  await io.run(["check-ref-format", `refs/heads/${input.sourceBranch}`], root);
  stop(!(await exists(path)), "worktree pathが既に存在します");
  stop(
    (
      await io.run(
        ["for-each-ref", "--format=%(refname)", `refs/heads/${branch}`],
        root,
      )
    ).trim() === "",
    "local branchが既に存在します",
  );
  stop(
    (
      await io.run(
        ["ls-remote", "--heads", "origin", `refs/heads/${branch}`],
        root,
      )
    ).trim() === "",
    "remote branchが既に存在します",
  );
  const parent = resolve(root, ".agent-runs", "worktrees");
  await mkdir(parent, { recursive: true });
  stop((await realpath(parent)) === parent, "worktree親pathがsymlinkです");
  await checkClean({ ...input, root }, io);
  await io.run(
    ["worktree", "add", "--no-checkout", "-b", branch, path, input.startSha],
    root,
  );
  try {
    const common = await realpath(
      resolve(
        path,
        (await io.run(["rev-parse", "--git-common-dir"], path)).trim(),
      ),
    );
    const marker = worktreeMarkerSchema.parse({
      schemaVersion: 1,
      runId: input.runId,
      repositoryRealpath: root,
      startSha: input.startSha,
      taskBranch: branch,
      gitCommonDir: common,
    });
    const markerPath = resolve(path, ".agent-run-marker.json");
    if (io.writeMarker)
      await io.writeMarker(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    else
      await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    return { path, branch, marker };
  } catch (error) {
    const rollback: string[] = [];
    try {
      await io.run(["worktree", "remove", "--force", path], root);
    } catch (rollbackError) {
      rollback.push(
        `worktree rollback: ${rollbackError instanceof Error ? rollbackError.message : "unknown"}`,
      );
    }
    try {
      await io.run(["branch", "-D", branch], root);
    } catch (rollbackError) {
      rollback.push(
        `branch rollback: ${rollbackError instanceof Error ? rollbackError.message : "unknown"}`,
      );
    }
    throw new Error(
      `STOP: worktree markerを作成できません: ${error instanceof Error ? error.message : "unknown"}${rollback.length > 0 ? `; ${rollback.join("; ")}` : ""}`,
    );
  }
}
