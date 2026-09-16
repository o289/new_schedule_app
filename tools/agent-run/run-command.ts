import { open, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApproval } from "./approval";
import { normalizePlan } from "./plan-hash";
import {
  createPlanViewModel,
  renderPlanHtml,
  renderPlanMarkdown,
} from "./plan-render";
import { runPaths } from "./run-paths";
import {
  startInputV2Schema,
  startRecordPath,
  startTaskV2,
} from "../pr-agent-start.js";

export interface RunCommandIO {
  read(path: string): Promise<string>;
  writeExclusive(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  run?(args: string[]): Promise<string>;
  start?(
    ...args: Parameters<typeof startTaskV2>
  ): ReturnType<typeof startTaskV2>;
}

export async function runCommand(
  command: string,
  runId: string,
  root: string,
  io: RunCommandIO = {
    read: (path) => readFile(resolve(root, path), "utf8"),
    writeExclusive: async (path, content) => {
      const handle = await open(resolve(root, path), "wx");
      try {
        await handle.writeFile(content);
      } finally {
        await handle.close();
      }
    },
    mkdir: (path) =>
      mkdir(resolve(root, path), { recursive: true }).then(() => undefined),
  },
): Promise<void> {
  const paths = runPaths(runId);
  const readInstance = async (path: string) => {
    if (!path.startsWith(`${paths.ai}/`) && !path.startsWith(`${paths.human}/`))
      throw new Error("STOP: run専用pathだけを指定してください");
    return io.read(path);
  };
  if (command === "create") {
    const view = createPlanViewModel(
      JSON.parse(await readInstance(paths.planSource)) as unknown,
    );
    if (view.plan.runId !== runId) throw new Error("STOP: runIdが不一致です");
    await io.mkdir(paths.human);
    await io.mkdir(paths.ai);
    await io.writeExclusive(paths.plan, normalizePlan(view.plan));
    await io.writeExclusive(paths.review, renderPlanHtml(view));
    await io.writeExclusive(
      `${paths.ai}/agent-plan.md`,
      renderPlanMarkdown(view),
    );
    await io.writeExclusive(
      paths.manifest,
      JSON.stringify({
        planId: view.plan.planId,
        runId,
        planHash: view.planHash,
        artifacts: ["plan.json", "plan-review.html", "agent-plan.md"],
      }) + "\n",
    );
    return;
  }
  if (command === "approve") {
    await createApproval(
      JSON.parse(
        await readInstance(`${paths.ai}/approval-input.json`),
      ) as unknown,
      {
        read: readInstance,
        writeExclusive: (_path, content) =>
          io.writeExclusive(paths.approval, content),
      },
    );
    return;
  }
  if (command === "start") {
    const input = startInputV2Schema.parse(
      JSON.parse(await readInstance(`${paths.ai}/start-input.json`)) as unknown,
    );
    if (input.plan.runId !== runId) throw new Error("STOP: runIdが不一致です");
    if (
      input.plan.path !== paths.plan ||
      input.approval.path !== paths.approval ||
      input.implementation.path !== `${paths.ai}/agent-plan.md`
    )
      throw new Error("STOP: start参照がrun専用pathと一致しません");
    const result = await (io.start ?? startTaskV2)(input, {
      read: readInstance,
      run:
        io.run ??
        (async () => {
          throw new Error("STOP: Git実行IOが未設定です");
        }),
    });
    await io.writeExclusive(
      startRecordPath(runId),
      JSON.stringify(result, null, 2) + "\n",
    );
    return;
  }
  throw new Error("STOP: commandはcreate、approve、startのいずれかです");
}
