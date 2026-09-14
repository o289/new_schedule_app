import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCliInvocation, writePlanRun } from "./agent-run/plan-render";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function main(args: string[], cwd: string): Promise<void> {
  validateCliInvocation(args, await realpath(cwd), root);
  let input: unknown;
  try {
    input = JSON.parse(
      await readFile(resolve(root, "docs/agent-plan-input.json"), "utf8"),
    ) as unknown;
  } catch {
    throw new Error("STOP: 固定入力docs/agent-plan-input.jsonを読み込めません");
  }
  console.log(`計画成果物を生成: ${await writePlanRun(input, root)}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2), process.cwd()).catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "STOP: 計画生成に失敗しました",
    );
    process.exitCode = 1;
  });
}
