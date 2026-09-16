import { open, mkdir, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { resolve } from "node:path";
import { createApproval } from "./approval";
import { normalizePlan } from "./plan-hash";
import {
  createPlanViewModel,
  renderPlanHtml,
  renderPlanMarkdown,
} from "./plan-render";
import { runPaths } from "./run-paths";
import { CanonicalOrchestrator } from "./canonical-orchestrator";
import { CanonicalStateStore } from "./state-store";
import { TrustedRunnerClient } from "../trusted-runner/client";
import {
  buildTrustedPublicationRequest,
  validateTrustedPublication,
} from "../trusted-runner/trusted-publication";
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
  trustedRunner?: {
    request(
      input: import("../trusted-runner/protocol").TrustedRunnerRequest,
    ): Promise<unknown>;
  };
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
  const runGit =
    io.run ??
    (async (args: string[]) => {
      const execFile = promisify(execFileCallback);
      return (
        await execFile("git", args, {
          cwd: root,
          shell: false,
        })
      ).stdout.toString();
    });
  const readInstance = async (path: string) => {
    if (!path.startsWith(`${paths.ai}/`) && !path.startsWith(`${paths.human}/`))
      throw new Error("STOP: run専用pathだけを指定してください");
    return io.read(path);
  };
  const readRequest = async (name: string) => {
    const path = `${paths.runtime}/requests/${name}`;
    if (!path.startsWith(`${paths.runtime}/requests/`))
      throw new Error("STOP: request pathが不正です");
    return io.read(path);
  };
  const canonical = async () => {
    const view = createPlanViewModel(
      JSON.parse(await readInstance(paths.plan)) as unknown,
    );
    if (view.plan.runId !== runId) throw new Error("STOP: runIdが不一致です");
    await io.mkdir(paths.runtime);
    return new CanonicalOrchestrator(
      new CanonicalStateStore(resolve(root, paths.events)),
      runId,
      {
        planHash: view.planHash,
        phases: view.plan.phases.map(({ id }) => ({ id })),
      },
    );
  };
  if (
    [
      "prepare",
      "approve-state",
      "ready",
      "start-phase",
      "begin-verify",
      "verify-pass",
      "verify-fail",
      "replan",
      "fail",
      "safety-stop",
      "publish",
    ].includes(command)
  ) {
    const orchestrator = await canonical();
    if (command === "prepare") return void (await orchestrator.prepare());
    if (command === "approve-state") return void (await orchestrator.approve());
    if (command === "ready") return void (await orchestrator.ready());
    if (command === "begin-verify")
      return void (await orchestrator.beginVerify());
    if (command === "replan") return void (await orchestrator.replan());
    if (command === "fail") return void (await orchestrator.fail());
    if (command === "safety-stop")
      return void (await orchestrator.safetyStop());
    if (command === "start-phase") {
      const request = z
        .object({ phaseId: z.string() })
        .strict()
        .parse(JSON.parse(await readRequest("start-phase.json")) as unknown);
      return void (await orchestrator.startPhase(request.phaseId));
    }
    if (command === "verify-pass") {
      const request = z
        .object({
          phaseId: z.string(),
          evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
          verifiedSha: z.string().regex(/^[a-f0-9]{40}$/),
          gatesPassed: z.literal(true),
        })
        .strict()
        .parse(JSON.parse(await readRequest("verify-pass.json")) as unknown);
      return void (await orchestrator.verificationPassed(request));
    }
    if (command === "verify-fail") {
      const request = z
        .object({
          kind: z.string(),
          code: z.string(),
          message: z.string().optional(),
        })
        .strict()
        .parse(JSON.parse(await readRequest("verify-fail.json")) as unknown);
      return void (await orchestrator.verificationFailed(request as never));
    }
    const trustedRunner =
      io.trustedRunner ??
      new TrustedRunnerClient({
        socketPath: z
          .object({ socket: z.object({ path: z.string().min(1) }).strict() })
          .strict()
          .parse(
            JSON.parse(
              await readFile(
                resolve(root, "codx/trusted-runner/runner-policy.json"),
                "utf8",
              ),
            ),
          ).socket.path,
      });
    const handoff = await readRequest("publication-handoff.json");
    const targetSha = (await runGit(["rev-parse", "HEAD"])).trim();
    const plan = await readInstance(paths.plan);
    const approval = await readInstance(paths.approval);
    const startRecord = await readInstance(paths.start);
    const store = new CanonicalStateStore(resolve(root, paths.events));
    const snapshot = await store.snapshot();
    if (snapshot.state !== "COMPLETED" || !snapshot.planHash)
      throw new Error("STOP: canonical runが公開可能な状態ではありません");
    const request = buildTrustedPublicationRequest({
      runId,
      planHash: snapshot.planHash,
      revision: snapshot.revision,
      targetSha,
      plan,
      approval,
      startRecord,
      handoff,
    });
    validateTrustedPublication(
      request,
      { plan, approval, startRecord, handoff, revision: snapshot.revision },
      new Date(),
    );
    await orchestrator.publish(
      targetSha,
      async () => ({
        canonicalContextVerified: true,
        planHashValid: true,
        approvalHashValid: true,
        startHashValid: true,
      }),
      async () => ({ publicationBoundaryRevalidated: true }),
      async () => {
        const response = await trustedRunner.request(request);
        if (!(
          response &&
          typeof response === "object" &&
          "ok" in response &&
          response.ok === true
        ))
          throw new Error("STOP: trusted publisherが公開を拒否しました");
      },
    );
    return;
  }
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
