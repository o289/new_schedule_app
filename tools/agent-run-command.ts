import { execFile as execFileCallback } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
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

const execFile = promisify(execFileCallback);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (process.argv.length !== 2) throw new Error("STOP: CLI引数は受け付けません");
if ((await realpath(process.cwd())) !== (await realpath(root)))
  throw new Error("STOP: repository rootから実行してください");
const input = agentRunCommandInputSchema.parse(
  JSON.parse(
    await readFile(resolve(root, "docs/agent-run-command.json"), "utf8"),
  ) as unknown,
);
const execGit = async (args: string[], cwd: string) =>
  (await execFile("git", args, { cwd })).stdout;
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
