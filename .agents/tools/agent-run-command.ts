import { execFile as execFileCallback } from "node:child_process";
import { mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StateStore } from "./agent-run/state-store";
import {
  agentRunCommandInputSchema,
  TrustedOrchestrator,
} from "./agent-run/orchestrator";
import { inspectPaths } from "./agent-run/path-guard";
import { inspectDependencies } from "./agent-run/dependency-guard";
import {
  createPlanViewModel,
  renderPlanHtml,
  renderPlanMarkdown,
} from "./agent-run/plan-render";
import { createApproval } from "./agent-run/approval";
import { runPaths } from "./agent-run/run-paths";
import {
  startInputV2Schema,
  startRecordPath,
  startTaskV2,
} from "./pr-agent-start";
import { normalizePlan } from "./agent-run/plan-hash";
import { runCommand as executeRunCommand } from "./agent-run/run-command";

const execFile = promisify(execFileCallback);
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliArgs = process.argv.slice(2);
const execGit = async (args: string[], cwd: string) =>
  (await execFile("git", args, { cwd })).stdout;
if ((await realpath(process.cwd())) !== (await realpath(root)))
  throw new Error("STOP: repository rootから実行してください");
const legacyRunCommand = async (
  command: string,
  runId: string,
): Promise<void> => {
  const paths = runPaths(runId);
  const safeRead = async (path: string) => {
    if (!path.startsWith(`${paths.ai}/`) && !path.startsWith(`${paths.human}/`))
      throw new Error("STOP: run専用pathだけを指定してください");
    return readFile(resolve(root, path), "utf8");
  };
  if (command === "create") {
    const source = await safeRead(paths.planSource);
    const view = createPlanViewModel(JSON.parse(source) as unknown);
    if (view.plan.runId !== runId) throw new Error("STOP: runIdが不一致です");
    await mkdir(resolve(root, paths.human), { recursive: true });
    await mkdir(resolve(root, paths.ai), { recursive: true });
    await writeFile(resolve(root, paths.plan), normalizePlan(view.plan), {
      flag: "wx",
    });
    await writeFile(resolve(root, paths.review), renderPlanHtml(view), {
      flag: "wx",
    });
    await writeFile(
      resolve(root, `${paths.ai}/agent-plan.md`),
      renderPlanMarkdown(view),
      { flag: "wx" },
    );
    await writeFile(
      resolve(root, paths.manifest),
      JSON.stringify({
        planId: view.plan.planId,
        runId,
        planHash: view.planHash,
        artifacts: ["plan.json", "plan-review.html", "agent-plan.md"],
      }) + "\n",
      { flag: "wx" },
    );
    return;
  }
  if (command === "approve") {
    const input = JSON.parse(
      await safeRead(`${paths.ai}/approval-input.json`),
    ) as unknown;
    await createApproval(input, {
      read: safeRead,
      writeExclusive: async (_path, content) => {
        const handle = await open(resolve(root, paths.approval), "wx");
        try {
          await handle.writeFile(content);
        } finally {
          await handle.close();
        }
      },
    });
    return;
  }
  if (command === "start") {
    const raw = JSON.parse(
      await safeRead(`${paths.ai}/start-input.json`),
    ) as unknown;
    const input = startInputV2Schema.parse(raw);
    if (input.plan.runId !== runId) throw new Error("STOP: runIdが不一致です");
    const result = await startTaskV2(input, {
      read: async (path) => safeRead(path),
      run: async (args) => execGit(args, root),
    });
    const handle = await open(resolve(root, startRecordPath(runId)), "wx");
    try {
      await handle.writeFile(JSON.stringify(result, null, 2) + "\n");
    } finally {
      await handle.close();
    }
    return;
  }
  throw new Error("STOP: commandはcreate、approve、startのいずれかです");
};
void legacyRunCommand;
if (cliArgs.length > 0) {
  if (cliArgs.length !== 2)
    throw new Error("STOP: agent run <command> <runId>形式だけを受け付けます");
  await executeRunCommand(cliArgs[0]!, cliArgs[1]!, root);
  process.exit(0);
}
if (process.argv.length !== 2) throw new Error("STOP: CLI引数は受け付けません");
const input = agentRunCommandInputSchema.parse(
  JSON.parse(
    await readFile(resolve(root, "docs/agent-run-command.json"), "utf8"),
  ) as unknown,
);
const context = {
  read: async (path: string) => readFile(path, "utf8"),
  realpath,
  head: async (cwd: string) => execGit(["rev-parse", "HEAD"], cwd),
  git: execGit,
  inspectPaths: (value: Parameters<typeof inspectPaths>[0]) =>
    inspectPaths(value),
  inspectDependencies: (value: unknown) =>
    inspectDependencies(value, {
      run: execGit,
      read: async (path) => readFile(path, "utf8"),
    }),
};
const runDirectory = resolve(root, ".agent-runs", input.runId);
const result = await new TrustedOrchestrator(
  runDirectory,
  new StateStore(resolve(runDirectory, "events.jsonl")),
  { context },
).execute(input.command);
console.log(JSON.stringify(result));
