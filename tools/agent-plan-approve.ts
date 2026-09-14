import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { approvalInputSchema, createApproval } from "./agent-run/approval";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("STOP: 引数は受け付けません");
  if ((await realpath(process.cwd())) !== root)
    throw new Error("STOP: repository rootから実行してください");
  const input = approvalInputSchema.parse(
    JSON.parse(
      await readFile(
        resolve(root, "docs/agent-plan-approval-input.json"),
        "utf8",
      ),
    ) as unknown,
  );
  const safePath = (path: string): string => {
    if (!path.startsWith("docs/") || path.split("/").includes(".."))
      throw new Error("STOP: docs配下のpathだけを指定してください");
    return resolve(root, path);
  };
  await createApproval(input, {
    read: async (path) => readFile(safePath(path), "utf8"),
    writeExclusive: async (path, content) => {
      const handle = await import("node:fs/promises").then(({ open }) =>
        open(safePath(`docs/agent-runs/${input.runId}/${path}`), "wx"),
      );
      try {
        await handle.writeFile(content);
      } finally {
        await handle.close();
      }
    },
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "STOP: 承認生成に失敗しました",
    );
    process.exitCode = 1;
  });
