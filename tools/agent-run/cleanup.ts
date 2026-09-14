import { readFile, realpath, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { z } from "zod";
import { worktreeMarkerSchema } from "./worktree";
import { replayEvents, type RunSnapshot } from "./state-schema";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const runIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const cleanupInputSchema = z
  .object({
    root: z.string().min(1),
    runId: runIdSchema,
    startSha: sha,
    taskBranch: z.string().regex(/^agent-run\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();
export type CleanupInput = z.infer<typeof cleanupInputSchema>;
export interface CleanupIO {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  realpath(path: string): Promise<string>;
  run(args: string[], cwd: string): Promise<string>;
  mkdir(path: string): Promise<void>;
}
function stop(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`STOP: ${message}`);
}
export async function cleanupRun(
  raw: unknown,
  io: CleanupIO = {
    read: (path) => readFile(path, "utf8"),
    write: (path, content) => writeFile(path, content),
    mkdir: async (path) => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path, { recursive: true });
    },
    realpath,
    run: async (args, cwd) => {
      const { execFile } = await import("node:child_process");
      return new Promise((resolvePromise, reject) =>
        execFile("git", args, { cwd }, (error, stdout) =>
          error ? reject(error) : resolvePromise(stdout),
        ),
      );
    },
  },
): Promise<{ runId: string; worktree: string; state: RunSnapshot["state"] }> {
  const input = cleanupInputSchema.parse(raw);
  const root = await io.realpath(input.root);
  const runDirectory = resolve(root, ".agent-runs", input.runId);
  const worktree = resolve(root, ".agent-runs", "worktrees", input.runId);
  stop(
    !relative(root, worktree).startsWith("..") &&
      !isAbsolute(relative(root, worktree)),
    "worktree path escape",
  );
  let worktreeRealpath: string;
  try {
    worktreeRealpath = await io.realpath(worktree);
  } catch {
    throw new Error("STOP: 登録済みworktreeが存在しません");
  }
  stop(worktreeRealpath === worktree, "worktree realpathが不一致です");
  try {
    stop(
      (await io.realpath(runDirectory)) === runDirectory,
      "run directory realpathが不一致です",
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("STOP:"))
      throw error;
    throw new Error("STOP: run directoryが登録されていません");
  }
  const marker = worktreeMarkerSchema.parse(
    JSON.parse(
      await io.read(join(worktree, ".agent-run-marker.json")),
    ) as unknown,
  );
  stop(
    marker.runId === input.runId &&
      marker.repositoryRealpath === root &&
      marker.startSha === input.startSha &&
      marker.taskBranch === input.taskBranch,
    "cleanup marker mismatch",
  );
  const common = await io.realpath(
    resolve(
      worktree,
      (await io.run(["rev-parse", "--git-common-dir"], worktree)).trim(),
    ),
  );
  stop(
    marker.gitCommonDir === common &&
      common === (await io.realpath(resolve(root, ".git"))),
    "cleanup git common dir mismatch",
  );
  const eventText = await io.read(join(runDirectory, "events.jsonl"));
  const parsedEvents = eventText
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
  stop(parsedEvents.length > 0, "run event logが空です");
  const state = replayEvents(parsedEvents);
  stop(
    state.runId === input.runId &&
      state.revision > 0 &&
      eventText.trim().length > 0,
    "run state identity mismatch",
  );
  const first = parsedEvents[0];
  const firstEvent = z
    .object({ runId: z.unknown(), targetSha: z.unknown() })
    .passthrough()
    .parse(first);
  stop(
    firstEvent.runId === input.runId && firstEvent.targetSha === input.startSha,
    "registered start SHA mismatch",
  );
  stop(
    ![
      "PUBLISH_READY",
      "REPLAN_REQUIRED",
      "QUARANTINED",
      "ROLLBACK",
      "DISCARD",
      "SAFETY_VIOLATION",
    ].includes(state.state),
    "公開済みまたは破棄済みrunです",
  );
  stop(
    (await io.run(["symbolic-ref", "--short", "HEAD"], worktree)).trim() ===
      input.taskBranch,
    "current branch mismatch",
  );
  stop(
    (await io.run(["rev-parse", "HEAD"], worktree)).trim() === input.startSha,
    "HEAD/start SHA mismatch",
  );
  stop(
    (await io.run(["symbolic-ref", "--short", "HEAD"], root)).trim() !==
      input.taskBranch,
    "primary checkout invariant violated",
  );
  const status = await io.run(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    worktree,
  );
  const diff = await io.run(["diff", "--stat", input.startSha, "--"], worktree);
  try {
    await io.mkdir(runDirectory);
    await io.write(
      join(runDirectory, "cleanup-evidence.json"),
      JSON.stringify(
        {
          redactedStatus: status.replace(
            /(token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,}]+/gi,
            "$1=[REDACTED]",
          ),
          diffSummary: diff,
          events: eventText,
        },
        null,
        2,
      ) + "\n",
    );
  } catch (error) {
    throw new Error(
      `STOP: cleanup証跡を保存できません: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
  await io.run(["worktree", "remove", "--force", worktree], root);
  await io.run(["branch", "-D", input.taskBranch], root);
  return { runId: input.runId, worktree, state: state.state };
}
