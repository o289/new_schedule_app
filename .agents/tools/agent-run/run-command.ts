import { open, mkdir, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { createHash } from "node:crypto";
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
import { isFinalResponseAllowed } from "./canonical-orchestration";
import { prepareLegacyImport } from "./legacy-import";
import { publicationEvidenceSchema } from "./canonical-state";
import { TrustedRunnerClient } from "../trusted-runner/client";
import {
  buildTrustedPublicationRequest,
  validateTrustedPublication,
} from "../trusted-runner/trusted-publication";
import {
  startInputV2Schema,
  startRecordV2Schema,
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
  statusExecutor?: typeof executeStatus;
}

export type StatusDeps = {
  plan: unknown;
  approval: unknown;
  start: unknown;
  handoff: unknown;
  currentHead: string;
  snapshot: Awaited<ReturnType<CanonicalStateStore["snapshot"]>>;
  now?: Date;
  validateContext: () => void;
  output?: (summary: unknown) => void;
};

export function executeStatus(runId: string, deps: StatusDeps) {
  const plan = createPlanViewModel(deps.plan);
  const start = startRecordV2Schema.parse(deps.start);
  if (
    start.plan.runId !== runId ||
    start.plan.path !== `ai/runs/${runId}/plan.json` ||
    start.approval.path !== `ai/runs/${runId}/approval.json` ||
    start.implementation.path !== `ai/runs/${runId}/agent-plan.md`
  )
    throw new Error("STOP: status artifact参照が不正です");
  if (
    start.mode !== plan.plan.branch.mode ||
    start.sourceBranch !== plan.plan.branch.source
  )
    throw new Error("STOP: statusのbranch/modeが計画と不一致です");
  const approval = deps.approval as { expiresAt?: unknown };
  if (
    typeof approval.expiresAt === "string" &&
    new Date(approval.expiresAt).getTime() <= (deps.now ?? new Date()).getTime()
  )
    throw new Error("STOP: approvalが期限切れです");
  deps.validateContext();
  const evidence = Object.values(deps.snapshot.evidenceByPhase);
  if (
    !evidence.length ||
    evidence.length !== plan.plan.phases.length ||
    evidence.some((item) => item.verifiedSha !== deps.currentHead)
  )
    throw new Error("STOP: 全Phaseの検証SHAが現在のHEADと一致しません");
  const pub = deps.snapshot.publicationEvidenceByState as Record<string, any>;
  const input = {
    mode: plan.plan.branch.mode,
    implementationState: deps.snapshot.state,
    publicationState: deps.snapshot.publicationState,
    targetSha: deps.currentHead,
    verifiedSha: deps.currentHead,
    head: start.head,
    ...(plan.plan.branch.mode === "pull_request" && pub.PR_CREATED
      ? {
          base: start.sourceBranch,
          prUrl: pub.PR_CREATED.url,
          prHead: pub.PR_CREATED.head,
          prBase: pub.PR_CREATED.base,
          prSha: pub.PR_CREATED.headSha,
          prState: pub.PR_CREATED.state,
          isDraft: pub.PR_CREATED.isDraft,
        }
      : {}),
  };
  const final = evaluateFinalStatus(input);
  const summary = {
    runId,
    implementationState: deps.snapshot.state,
    publicationState: deps.snapshot.publicationState,
    final,
    ...(pub.CI_PASSED ? { ciUrl: pub.CI_PASSED.ciUrl } : {}),
    ...(pub.PR_CREATED ? { prUrl: pub.PR_CREATED.url } : {}),
  };
  deps.output?.(summary);
  if (!final)
    throw new Error(
      `STOP: 公開状態は${deps.snapshot.publicationState}です。status成功条件を満たしていません`,
    );
  return summary;
}

/** Final status gate; callers must provide the exact typed completion shape. */
export function evaluateFinalStatus(input: unknown): boolean {
  try {
    return isFinalResponseAllowed(input);
  } catch {
    return false;
  }
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
        mode: view.plan.branch.mode,
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
      "status",
      "import-legacy-prepare",
    ].includes(command)
  ) {
    if (command === "import-legacy-prepare") {
      await prepareLegacyImport(
        runId,
        JSON.parse(
          await io.read(`${paths.ai}/legacy-import-input.json`),
        ) as unknown,
        io,
        paths,
        {
          markerContent: await io.read(".agent-run-marker.json"),
          git: { run: runGit },
          expectedWorktreeRoot: root,
        },
      );
      return;
    }
    const orchestrator = await canonical();
    if (command === "status") {
      const plan = createPlanViewModel(
        JSON.parse(await readInstance(paths.plan)) as unknown,
      );
      const stored = await new CanonicalStateStore(
        resolve(root, paths.events),
      ).snapshot();
      const targetSha = (await runGit(["rev-parse", "HEAD"])).trim();
      const verifiedShas = Object.values(stored.evidenceByPhase).map(
        (item) => item.verifiedSha,
      );
      const verifiedSha = verifiedShas[0];
      if (
        !verifiedSha ||
        verifiedShas.some((sha) => sha !== targetSha) ||
        verifiedShas.length !== plan.plan.phases.length
      )
        throw new Error("STOP: 全Phaseの検証SHAが現在のHEADと一致しません");
      const planText = await readInstance(paths.plan);
      const approvalText = await readInstance(paths.approval);
      const startText = await readInstance(paths.start);
      const startRecord = startRecordV2Schema.parse(
        JSON.parse(startText) as unknown,
      );
      if (
        startRecord.plan.path !== paths.plan ||
        startRecord.approval.path !== paths.approval ||
        startRecord.implementation.path !== `${paths.ai}/agent-plan.md` ||
        startRecord.mode !== plan.plan.branch.mode ||
        startRecord.sourceBranch !== plan.plan.branch.source
      )
        throw new Error("STOP: start recordとcanonical planが不一致です");
      const handoffText = await readRequest("publication-handoff.json");
      try {
        const req = buildTrustedPublicationRequest({
          runId,
          planHash: plan.planHash,
          revision: stored.revision,
          targetSha,
          plan: planText,
          approval: approvalText,
          startRecord: startText,
          handoff: handoffText,
        });
        validateTrustedPublication(
          req,
          {
            plan: planText,
            approval: approvalText,
            startRecord: startText,
            handoff: handoffText,
            revision: stored.revision,
          },
          new Date(),
        );
      } catch (error) {
        throw new Error(
          `STOP: canonical contextの再検証に失敗しました: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
      return void (io.statusExecutor ?? executeStatus)(runId, {
        plan: plan.plan,
        approval: JSON.parse(approvalText) as unknown,
        start: JSON.parse(startText) as unknown,
        handoff: JSON.parse(handoffText) as unknown,
        currentHead: targetSha,
        snapshot: stored,
        validateContext: () => undefined,
        output: (value) => console.log(JSON.stringify(value)),
      });
    }
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
    const planView = createPlanViewModel(JSON.parse(plan) as unknown);
    const approval = await readInstance(paths.approval);
    const startRecord = await readInstance(paths.start);
    startRecordV2Schema.parse(JSON.parse(startRecord) as unknown);
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
    if (snapshot.publicationState !== "PENDING")
      throw new Error("STOP: 公開はPENDING状態からのみ開始できます");
    try {
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
          const result =
            response &&
            typeof response === "object" &&
            "ok" in response &&
            response.ok === true
              ? "result" in response
                ? response.result
                : undefined
              : undefined;
          if (
            !result ||
            typeof result !== "object" ||
            !("publication" in result)
          )
            throw new Error("STOP: trusted publisherが公開を拒否しました");
          const publication = (result as { publication?: unknown }).publication;
          if (
            !publication ||
            typeof publication !== "object" ||
            !("pushedSha" in publication)
          )
            throw new Error(
              "STOP: trusted publisherの検証済み結果が不足しています",
            );
          const pushed = publicationEvidenceSchema.parse({
            kind: "BRANCH_PUSHED",
            pushedSha: (publication as { pushedSha: unknown }).pushedSha,
          }) as Extract<
            import("./canonical-state").PublicationEvidence,
            { kind: "BRANCH_PUSHED" }
          >;
          if (pushed.pushedSha !== targetSha)
            throw new Error("STOP: push SHAが対象SHAと不一致です");
          await orchestrator.updatePublicationState("BRANCH_PUSHED", pushed);
          if (!("ci" in publication))
            throw new Error("STOP: CI結果が不足しています");
          const ci = (
            publication as { ci?: { status?: unknown; url?: unknown } }
          ).ci;
          if (!ci || ci.status !== "success" || typeof ci.url !== "string")
            throw new Error("STOP: CI証跡が不正です");
          await orchestrator.updatePublicationState(
            "CI_PASSED",
            publicationEvidenceSchema.parse({
              kind: "CI_PASSED",
              pushedSha: targetSha,
              ciUrl: ci.url,
            }),
          );
          if (planView.plan.branch.mode === "pull_request") {
            if (!("pr" in publication))
              throw new Error("STOP: PR結果が不足しています");
            const pr = (publication as { pr?: unknown }).pr;
            const verifiedPr = publicationEvidenceSchema.parse(
              pr && typeof pr === "object"
                ? { kind: "PR_CREATED", ...pr }
                : undefined,
            ) as Extract<
              import("./canonical-state").PublicationEvidence,
              { kind: "PR_CREATED" }
            >;
            const start = startRecordV2Schema.parse(
              JSON.parse(startRecord) as unknown,
            );
            if (
              verifiedPr.head !== start.head ||
              verifiedPr.base !== start.sourceBranch ||
              verifiedPr.headSha !== targetSha ||
              !verifiedPr.url.startsWith("https://github.com/")
            )
              throw new Error("STOP: PR証跡が不正です");
            await orchestrator.updatePublicationState("PR_CREATED", verifiedPr);
          }
        },
      );
    } catch (error) {
      const current = await orchestrator.snapshot();
      if (current.publicationState !== "BLOCKED") {
        try {
          const message =
            error instanceof Error ? error.message : "publication failed";
          await orchestrator.updatePublicationState("BLOCKED", {
            kind: "BLOCKED",
            failureCode: "INTERNAL",
            messageHash: createHash("sha256").update(message).digest("hex"),
            retryCount: current.retryCount,
            remoteStateUnknown: true,
          });
        } catch {
          // Keep the original publication failure; the state store remains fail-closed.
        }
      }
      throw error;
    }
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
  throw new Error(
    "STOP: commandはcreate、approve、start、またはcanonical操作です",
  );
}
