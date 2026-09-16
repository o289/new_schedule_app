import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand as executeRunCommand } from "./agent-run/run-command";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliArgs = process.argv.slice(2);
if ((await realpath(process.cwd())) !== (await realpath(root)))
  throw new Error("STOP: repository rootから実行してください");
if (cliArgs.length > 0) {
  if (cliArgs.length !== 2)
    throw new Error("STOP: agent run <command> <runId>形式だけを受け付けます");
  await executeRunCommand(cliArgs[0]!, cliArgs[1]!, root);
  process.exit(0);
}
throw new Error("STOP: agent run <command> <runId>形式だけを受け付けます");
