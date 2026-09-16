import {
  appendFile,
  mkdir,
  open,
  readFile,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { StateStore } from "./state-store";
import { parsePlan, type Plan } from "./plan-schema";
import { hashPlan } from "./plan-hash";
import { renderPlanMarkdown } from "./plan-render";
import { approvalRecordSchema, validateApproval } from "./approval";
import { worktreeMarkerSchema } from "./worktree";
import { inspectDependencies } from "./dependency-guard";
import { inspectPaths } from "./path-guard";
import { startRecordV2Schema } from "../pr-agent-start.js";
import {
  classifyFailure,
  type ClassifiedFailure,
  type FailureInput,
} from "./failure-classifier.js";
import type { RunEvent } from "./state-schema";
import type {
  PublicationRequest,
  TrustedRunnerRequest,
  TrustedRunnerResponse,
} from "../trusted-runner/protocol.js";
import { TrustedRunnerClient } from "../trusted-runner/client.js";
import { sanitizeString } from "../trusted-runner/redaction.js";
import {
  validatePublicationIntent,
  type PublicationEvidence,
} from "../trusted-runner/publication-policy.js";

const actor = z.enum(["planner", "runner", "verifier", "publisher"]);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const evidenceBase = {
  runId: identifier,
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  phaseId: identifier,
  retryCount: z.number().int().min(0).max(3),
  targetSha: sha,
  actor: z.enum(["runner", "verifier"]),
};
const implementationEvidenceSchema = z
  .object({ ...evidenceBase, summary: z.string().trim().min(1) })
  .strict();
const gateEvidenceSchema = z
  .object({
    ...evidenceBase,
    gateId: identifier,
    gateName: z.string().trim().min(1),
    exitCode: z.number().int(),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const safetyEvidenceSchema = z
  .object({
    reasonCode: z.string().min(1).max(128),
    message: z.string().max(256),
    targetSha: sha,
  })
  .strict();
const actionBase = { expectedRevision: z.number().int().nonnegative(), actor };
export const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("prepare"),
      expectedRevision: z.literal(0),
      actor: z.literal("planner"),
    })
    .strict(),
  z
    .object({
      action: z.literal("begin_phase"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.literal("runner"),
      phaseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("record_implementation"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.literal("runner"),
      summary: z.string().trim().min(1),
      targetSha: sha,
    })
    .strict(),
  z
    .object({
      action: z.literal("begin_verify"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.literal("verifier"),
    })
    .strict(),
  z
    .object({
      action: z.literal("record_result"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.literal("verifier"),
      gateId: identifier,
      gateName: z.string().trim().min(1),
      exitCode: z.number().int(),
      startedAt: z.string().datetime({ offset: true }),
      completedAt: z.string().datetime({ offset: true }),
      targetSha: sha,
    })
    .strict(),
  z
    .object({
      action: z.literal("checkpoint"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.literal("publisher"),
      commitSha: sha,
    })
    .strict(),
  z
    .object({
      action: z.literal("publish"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.literal("publisher"),
    })
    .strict(),
  z
    .object({
      action: z.literal("quarantine"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.enum(["runner", "verifier"]),
      reason: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("cleanup"),
      expectedRevision: actionBase.expectedRevision,
      actor: z.literal("runner"),
    })
    .strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export const agentRunCommandInputSchema = z
  .object({ runId: identifier, command: actionSchema })
  .strict();
export interface ContextIO {
  read(path: string): Promise<string>;
  now?: () => Date;
  realpath?: (path: string) => Promise<string>;
  head?: (path: string) => Promise<string>;
  git?: (args: string[], cwd: string) => Promise<string>;
  lstat?: (
    path: string,
  ) => Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
  inspectPaths?: (input: {
    root: string;
    startSha: string;
    allowedPaths: string[];
    forbiddenPaths: string[];
  }) => Promise<Awaited<ReturnType<typeof inspectPaths>>>;
  inspectDependencies?: (
    input: unknown,
  ) => Promise<Awaited<ReturnType<typeof inspectDependencies>>>;
}
const contentHash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
function stop(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`STOP: ${message}`);
}
async function parseEvidenceLog<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  try {
    const content = await readFile(path, "utf8");
    if (!content.trim()) return [];
    return content
      .trimEnd()
      .split("\n")
      .map((line) => schema.parse(JSON.parse(line) as unknown));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw new Error("STOP: 証跡JSONLが不正です");
  }
}
export interface VerifiedContext {
  plan: Plan;
  repositoryRoot: string;
  startSha: string;
  taskBranch: string;
  worktree: string;
}

export async function verifyCanonicalContext(
  root: string,
  runId: string,
  io: ContextIO,
): Promise<VerifiedContext> {
  const canonicalRoot = await (io.realpath ?? realpath)(root);
  const base = resolve(canonicalRoot, "docs/agent-runs", runId);
  const planText = await io.read(resolve(base, "plan.json"));
  const plan = parsePlan(JSON.parse(planText) as unknown);
  const manifest = z
    .object({
      planId: z.string(),
      runId: z.string(),
      planHash: z.string().regex(/^[a-f0-9]{64}$/),
      artifacts: z.tuple([
        z.literal("plan.json"),
        z.literal("plan-review.html"),
        z.literal("agent-plan.md"),
      ]),
    })
    .strict()
    .parse(
      JSON.parse(await io.read(resolve(base, "manifest.json"))) as unknown,
    );
  stop(
    plan.runId === runId &&
      manifest.runId === runId &&
      manifest.planId === plan.planId &&
      manifest.planHash === hashPlan(plan),
    "plan context mismatch",
  );
  const approvalText = await io.read(resolve(base, "approval.json"));
  const approval = approvalRecordSchema.parse(
    JSON.parse(approvalText) as unknown,
  );
  validateApproval(approval, planText, (io.now ?? (() => new Date()))());
  stop(
    approval.runId === runId &&
      approval.planHash === hashPlan(plan) &&
      approval.plan.sha256 === contentHash(planText),
    "approval context mismatch",
  );
  const start = startRecordV2Schema.parse(
    JSON.parse(await io.read(resolve(base, "start.json"))) as unknown,
  );
  const expectedPlanPath = `docs/agent-runs/${runId}/plan.json`,
    expectedApprovalPath = `docs/agent-runs/${runId}/approval.json`,
    expectedImplementationPath = `docs/agent-runs/${runId}/agent-plan.md`;
  stop(
    start.plan.path === expectedPlanPath &&
      start.approval.path === expectedApprovalPath &&
      start.implementation.path === expectedImplementationPath,
    "start ref pathが固定pathと不一致です",
  );
  stop(
    start.plan.runId === runId &&
      start.plan.planHash === hashPlan(plan) &&
      start.plan.sha256 === contentHash(planText),
    "start plan ref mismatch",
  );
  stop(
    start.approval.runId === runId &&
      start.approval.planHash === hashPlan(plan) &&
      start.approval.sha256 === contentHash(approvalText),
    "start approval ref mismatch",
  );
  const implementationText = await io.read(resolve(base, "agent-plan.md"));
  stop(
    start.implementation.sha256 === contentHash(implementationText),
    "agent-plan hash mismatch",
  );
  stop(
    implementationText ===
      renderPlanMarkdown({ plan, planHash: hashPlan(plan) }),
    "agent-plan内容がcanonical planと不一致です",
  );
  stop(
    start.sourceBranch === plan.branch.source &&
      start.mode === plan.branch.mode,
    "start context mismatch",
  );
  stop(
    plan.branch.worktree === `.agent-runs/worktrees/${runId}`,
    "plan worktreeが固定pathと不一致です",
  );
  const worktree = resolve(canonicalRoot, plan.branch.worktree);
  const marker = worktreeMarkerSchema.parse(
    JSON.parse(
      await io.read(resolve(worktree, ".agent-run-marker.json")),
    ) as unknown,
  );
  const worktreeReal = await (io.realpath ?? realpath)(worktree);
  stop(io.git !== undefined, "git IOが未注入です");
  const commonDir = await (io.realpath ?? realpath)(
    resolve(
      worktree,
      (await io.git(["rev-parse", "--git-common-dir"], worktree)).trim(),
    ),
  );
  stop(
    marker.runId === runId &&
      marker.repositoryRealpath === canonicalRoot &&
      marker.startSha === start.reviewBaseSha &&
      marker.taskBranch === `agent-run/${runId}` &&
      marker.gitCommonDir === commonDir,
    "worktree marker mismatch",
  );
  stop(
    worktreeReal === worktree &&
      !relative(canonicalRoot, worktree).startsWith("..") &&
      !isAbsolute(relative(canonicalRoot, worktree)),
    "worktree path escape",
  );
  return {
    plan,
    repositoryRoot: canonicalRoot,
    startSha: start.reviewBaseSha,
    taskBranch: marker.taskBranch,
    worktree,
  };
}
export interface OrchestratorIO {
  now?: () => Date;
  context?: ContextIO;
  runner?: {
    request(input: TrustedRunnerRequest): Promise<TrustedRunnerResponse>;
  };
  abortChildren?: () => Promise<void>;
  revokeCapabilities?: () => Promise<void>;
}
export type TrustedCapabilityOutcome =
  TrustedRunnerResponse | ClassifiedFailure | RunEvent;
function requirePhase(
  phase: Plan["phases"][number] | undefined,
): Plan["phases"][number] {
  if (!phase) throw new Error("STOP: current Phaseがありません");
  return phase;
}
async function currentHead(
  context: VerifiedContext,
  io: ContextIO,
): Promise<string> {
  if (!io.head) throw new Error("STOP: head IO未注入です");
  return (await io.head(context.worktree)).trim();
}
type Snapshot = Awaited<ReturnType<StateStore["snapshot"]>>;
const makeEvent = (
  snapshot: Snapshot,
  action: Action,
  from: Snapshot["state"] | null,
  to: Snapshot["state"],
  targetSha: string,
  occurredAt: string,
  phaseId: string | null = snapshot.phaseId,
  retryCount = snapshot.retryCount,
) => ({
  schemaVersion: 1 as const,
  runId: snapshot.runId,
  planHash: snapshot.planHash,
  actor: action.actor,
  occurredAt,
  targetSha,
  from,
  to,
  phaseId,
  retryCount,
});

export class TrustedOrchestrator {
  constructor(
    private readonly runDirectory: string,
    private readonly store: StateStore,
    private readonly io: OrchestratorIO,
  ) {}
  private async head(context: VerifiedContext): Promise<string> {
    if (!this.io.context)
      throw new Error("STOP: canonical contextが未検証です");
    return currentHead(context, this.io.context);
  }
  private async publicationRequest(
    context: VerifiedContext,
    snapshot: Snapshot,
  ): Promise<{
    request: PublicationRequest;
    targetSha: string;
    branch: string;
  }> {
    const trustedIO = this.io.context;
    stop(trustedIO !== undefined, "canonical contextが未検証です");
    const base = resolve(
      context.repositoryRoot,
      "docs",
      "agent-runs",
      snapshot.runId,
    );
    const [plan, approval, startRecord, handoff] = await Promise.all([
      trustedIO.read(resolve(base, "plan.json")),
      trustedIO.read(resolve(base, "approval.json")),
      trustedIO.read(
        resolve(
          context.repositoryRoot,
          "docs/agent-runs",
          snapshot.runId,
          "start.json",
        ),
      ),
      trustedIO.read(
        resolve(context.repositoryRoot, "docs/pr-agent-handoff.json"),
      ),
    ]);
    const targetSha = (await this.head(context)).trim();
    const evidence: PublicationEvidence = {
      plan,
      approval,
      startRecord,
      handoff,
      revision: snapshot.revision,
    };
    const request: PublicationRequest = {
      protocolVersion: "1",
      runId: snapshot.runId,
      planHash: snapshot.planHash,
      revision: snapshot.revision,
      capability: "publish_approved_sha",
      args: {
        targetSha,
        canonicalContext: {
          startRecordSha256: contentHash(startRecord),
          approvalSha256: contentHash(approval),
          handoffSha256: contentHash(handoff),
          headSha: targetSha,
        },
      },
      nonce: TrustedRunnerClient.createNonce(),
    };
    const intent = validatePublicationIntent(
      request,
      evidence,
      (this.io.now ?? (() => new Date()))(),
    );
    return { request, targetSha, branch: intent.branch };
  }
  private async verifyPublishedRemote(
    context: VerifiedContext,
    branch: string,
    targetSha: string,
  ): Promise<void> {
    const trustedIO = this.io.context;
    stop(trustedIO?.git !== undefined, "trusted git IOが未注入です");
    const output = await trustedIO.git(
      ["ls-remote", "--heads", "origin", `refs/heads/${branch}`],
      context.worktree,
    );
    const fields = output.trim().split(/\s+/);
    stop(
      fields.length === 2 &&
        fields[0] === targetSha &&
        fields[1] === `refs/heads/${branch}`,
      "runner公開後のremote SHAが不一致です",
    );
  }
  private validateTrustedIO(): void {
    const context = this.io.context;
    stop(
      Boolean(
        context?.realpath &&
        context.lstat &&
        context.head &&
        context.git &&
        context.inspectPaths &&
        context.inspectDependencies &&
        this.io.now,
      ),
      "trusted IOが未注入です",
    );
  }
  public async executeTrustedCapability(
    request: TrustedRunnerRequest,
    targetSha: string,
  ): Promise<TrustedCapabilityOutcome> {
    stop(this.io.runner !== undefined, "trusted runner clientが未注入です");
    const snapshot = await this.store.snapshot();
    stop(
      request.runId === snapshot.runId &&
        request.planHash === snapshot.planHash &&
        request.revision === snapshot.revision,
      "runner response context mismatch",
    );
    let runnerCallDone = false;
    try {
      const response = await this.io.runner.request(request);
      runnerCallDone = true;
      if (!(
        response.runId === request.runId &&
        response.planHash === request.planHash &&
        response.revision === request.revision &&
        response.nonce === request.nonce &&
        response.capability === request.capability
      ))
        return this.handleClassifiedFailure(
          classifyFailure({ kind: "runner", code: "PROTOCOL_MISMATCH" }),
          targetSha,
        );
      if (response.ok)
        return response.result.exitCode === 0
          ? response
          : await this.handleClassifiedFailure(
              classifyFailure({ kind: "runner", code: "NONZERO" }),
              targetSha,
            );
      if (response.error.code === "UNKNOWN_CAPABILITY")
        return this.handleClassifiedFailure(
          classifyFailure({
            kind: "policy",
            code: "CAPABILITY_UNAVAILABLE",
          }),
          targetSha,
        );
      const code =
        response.error.code === "TIMEOUT"
          ? "TIMEOUT"
          : response.error.code === "PROTOCOL_MISMATCH"
            ? "PROTOCOL_MISMATCH"
            : "CONNECTION_ERROR";
      const classified = classifyFailure({ kind: "runner", code });
      return await this.handleClassifiedFailure(classified, targetSha);
    } catch (error: unknown) {
      if (runnerCallDone) throw error;
      const message = error instanceof Error ? error.message : "runner error";
      const classified = classifyFailure({
        kind: "runner",
        code: /timed out/i.test(message)
          ? "TIMEOUT"
          : /protocol|context mismatch/i.test(message)
            ? "PROTOCOL_MISMATCH"
            : "CONNECTION_ERROR",
      });
      return await this.handleClassifiedFailure(classified, targetSha);
    }
  }
  public async reportTrustedFailure(
    input: FailureInput,
    targetSha: string,
  ): Promise<TrustedCapabilityOutcome> {
    return this.handleClassifiedFailure(
      classifyFailure(input),
      targetSha,
      input.message,
    );
  }
  public async handleClassifiedFailure(
    failure: ClassifiedFailure,
    targetSha: string,
    rawMessage?: string,
  ): Promise<RunEvent> {
    const snapshot = await this.store.snapshot();
    const occurredAt = (this.io.now ?? (() => new Date()))().toISOString();
    if (failure.classification === "SAFETY_VIOLATION") {
      const safety = await this.store.append(
        makeEvent(
          snapshot,
          {
            action: "quarantine",
            expectedRevision: snapshot.revision,
            actor: "runner",
            reason: failure.reasonCode,
          },
          snapshot.state,
          "SAFETY_VIOLATION",
          targetSha,
          occurredAt,
        ),
      );
      if (this.io.revokeCapabilities) await this.io.revokeCapabilities();
      else throw new Error("SAFETY_VIOLATION: capability revoke unavailable");
      if (this.io.abortChildren) await this.io.abortChildren();
      else throw new Error("SAFETY_VIOLATION: child abort unavailable");
      const message = sanitizeString(rawMessage ?? failure.safeMessage);
      const evidence = safetyEvidenceSchema.parse({
        reasonCode: failure.reasonCode,
        message,
        targetSha,
      });
      await appendFile(
        join(this.runDirectory, "safety-evidence.jsonl"),
        `${JSON.stringify(evidence)}\n`,
        { encoding: "utf8", flag: "a" },
      );
      if (!this.io.runner)
        throw new Error("SAFETY_VIOLATION: quarantine runner unavailable");
      const reasonCode = [
        "SAFETY_VIOLATION",
        "SECRET_DETECTED",
        "PATH_VIOLATION",
        "RUNNER_BYPASS",
      ].includes(failure.reasonCode)
        ? (failure.reasonCode as
            | "SAFETY_VIOLATION"
            | "SECRET_DETECTED"
            | "PATH_VIOLATION"
            | "RUNNER_BYPASS")
        : "RUNNER_BYPASS";
      const quarantineRequest = {
        protocolVersion: "1",
        runId: snapshot.runId,
        planHash: snapshot.planHash,
        revision: safety.sequence,
        capability: "quarantine_run",
        args: { reasonCode },
        nonce: TrustedRunnerClient.createNonce(),
      } as const;
      const quarantineResponse =
        await this.io.runner.request(quarantineRequest);
      if (
        !quarantineResponse.ok ||
        quarantineResponse.runId !== quarantineRequest.runId ||
        quarantineResponse.planHash !== quarantineRequest.planHash ||
        quarantineResponse.revision !== quarantineRequest.revision ||
        quarantineResponse.nonce !== quarantineRequest.nonce ||
        quarantineResponse.capability !== quarantineRequest.capability
      )
        throw new Error("SAFETY_VIOLATION: quarantine response mismatch");
      return this.store.append(
        makeEvent(
          {
            ...snapshot,
            state: "SAFETY_VIOLATION",
            revision: safety.sequence,
            eventHash: safety.eventHash,
          },
          {
            action: "quarantine",
            expectedRevision: safety.sequence,
            actor: "runner",
            reason: failure.reasonCode,
          },
          "SAFETY_VIOLATION",
          "QUARANTINED",
          targetSha,
          occurredAt,
        ),
      );
    }
    const to =
      failure.classification === "REWORK"
        ? "REWORK"
        : failure.classification === "REPLAN_REQUIRED"
          ? "REPLAN_REQUIRED"
          : "INFRA_FAIL";
    if (
      !["PHASE_RUNNING", "VERIFYING", "PUBLISH_READY"].includes(snapshot.state)
    )
      throw new Error("failure state is not active");
    return this.store.append(
      makeEvent(
        snapshot,
        {
          action: "quarantine",
          expectedRevision: snapshot.revision,
          actor: "runner",
          reason: failure.reasonCode,
        },
        snapshot.state,
        to,
        targetSha,
        occurredAt,
        to === "REPLAN_REQUIRED" ? null : snapshot.phaseId,
      ),
    );
  }
  private async context(action: Action): Promise<VerifiedContext> {
    stop(this.io.context !== undefined, "canonical contextが未検証です");
    const runDirectory = resolve(this.runDirectory);
    const runId = runDirectory.split("/").at(-1) ?? "";
    const root = resolve(runDirectory, "../..");
    if (this.io.context.realpath) {
      stop(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(runId) &&
          runDirectory === resolve(root, ".agent-runs", runId),
        "runDirectoryが固定pathと不一致です",
      );
      try {
        stop(
          (await this.io.context.realpath(runDirectory)) === runDirectory,
          "runDirectoryがsymlinkです",
        );
      } catch (error) {
        const parent = resolve(root, ".agent-runs");
        stop(
          (await this.io.context.realpath(parent)) === parent,
          "runDirectory親pathが不正です",
        );
        if (this.io.context.lstat) {
          try {
            await this.io.context.lstat(runDirectory);
            throw new Error("STOP: runDirectoryが既に存在します");
          } catch (inner) {
            if (!(
              inner instanceof Error &&
              "code" in inner &&
              inner.code === "ENOENT"
            ))
              throw inner;
          }
        }
        if (action.action !== "prepare") throw error;
      }
    }
    return verifyCanonicalContext(root, runId, this.io.context);
  }
  private async guard(
    context: VerifiedContext,
    phase: Plan["phases"][number],
  ): Promise<"CLEAN" | "REPLAN_REQUIRED" | "SAFETY_VIOLATION" | "INFRA_FAIL"> {
    try {
      if (
        !this.io.context?.inspectPaths ||
        !this.io.context.inspectDependencies
      )
        throw new Error("guard IO未注入");
      const paths = await this.io.context.inspectPaths({
        root: context.worktree,
        startSha: context.startSha,
        allowedPaths: phase.allowedPaths,
        forbiddenPaths: context.plan.forbiddenPaths,
      });
      if (paths.classification === "SAFETY_VIOLATION")
        return "SAFETY_VIOLATION";
      if (paths.classification === "REPLAN_REQUIRED") return "REPLAN_REQUIRED";
      const deps = await this.io.context.inspectDependencies({
        root: context.worktree,
        startSha: context.startSha,
        dependencyChanges: context.plan.dependencyChanges,
      });
      return deps.classification;
    } catch {
      return "INFRA_FAIL";
    }
  }
  private async guardEvent(
    snapshot: Snapshot,
    action: Action,
    context: VerifiedContext,
    phase: Plan["phases"][number],
  ): Promise<unknown | null> {
    const classification = await this.guard(context, phase);
    if (classification === "CLEAN") return null;
    const head = (await this.head(context)).trim();
    const allowed =
      classification === "INFRA_FAIL" ||
      classification === "REPLAN_REQUIRED" ||
      classification === "SAFETY_VIOLATION";
    stop(allowed, "guard分類が不正です");
    stop(
      ["PHASE_RUNNING", "VERIFYING"].includes(snapshot.state),
      "guard stateが不正です",
    );
    const keepPhase = classification !== "REPLAN_REQUIRED";
    return this.store.append({
      schemaVersion: 1,
      runId: snapshot.runId,
      planHash: snapshot.planHash,
      actor: action.actor,
      occurredAt: (this.io.now ?? (() => new Date()))().toISOString(),
      targetSha: head,
      from: snapshot.state,
      to: classification,
      phaseId: keepPhase ? snapshot.phaseId : null,
      retryCount: keepPhase ? snapshot.retryCount : 0,
    });
  }
  async execute(raw: unknown): Promise<unknown> {
    const action = actionSchema.parse(raw);
    const context = await this.context(action);
    this.validateTrustedIO();
    const trustedIO = this.io.context;
    stop(trustedIO !== undefined, "canonical contextが未検証です");
    const now = () => (this.io.now ?? (() => new Date()))();
    await mkdir(this.runDirectory, { recursive: true });
    const lockPath = join(this.runDirectory, ".lock");
    let handle;
    try {
      handle = await open(lockPath, "wx");
    } catch {
      throw new Error("STOP: concurrent actionです");
    }
    try {
      const events = await this.store.readEvents();
      if (action.action === "prepare") {
        stop(events.length === 0, "prepareは二重実行できません");
        const occurredAt = now().toISOString();
        const first = await this.store.append({
          schemaVersion: 1,
          runId: context.plan.runId,
          planHash: hashPlan(context.plan),
          actor: action.actor,
          occurredAt,
          targetSha: context.startSha,
          from: null,
          to: "PREPARED",
          phaseId: null,
          retryCount: 0,
        });
        await this.store.append({
          schemaVersion: 1,
          runId: context.plan.runId,
          planHash: hashPlan(context.plan),
          actor: action.actor,
          occurredAt,
          targetSha: context.startSha,
          from: "PREPARED",
          to: "PLAN_APPROVED",
          phaseId: null,
          retryCount: 0,
        });
        const last = await this.store.append({
          schemaVersion: 1,
          runId: context.plan.runId,
          planHash: hashPlan(context.plan),
          actor: action.actor,
          occurredAt,
          targetSha: context.startSha,
          from: "PLAN_APPROVED",
          to: "WORKTREE_READY",
          phaseId: null,
          retryCount: 0,
        });
        return {
          revision: last.sequence,
          state: last.to,
          first: first.sequence,
        };
      }
      const snapshot = await this.store.snapshot();
      const firstEvent = events[0];
      stop(firstEvent !== undefined, "run開始eventがありません");
      stop(snapshot.revision === action.expectedRevision, "stale revisionです");
      const elapsed = now().getTime() - Date.parse(firstEvent.occurredAt);
      stop(
        elapsed >= 0 &&
          elapsed <= context.plan.limits.maxDurationMinutes * 60_000,
        "runの制限時間を超えています",
      );
      const phase = snapshot.phaseId
        ? context.plan.phases.find((item) => item.id === snapshot.phaseId)
        : undefined;
      if (
        ["record_implementation", "record_result", "begin_verify"].includes(
          action.action,
        )
      )
        stop(phase !== undefined, "current Phaseがありません");
      if (action.action === "publish") {
        stop(
          snapshot.state === "PUBLISH_READY" || snapshot.state === "INFRA_FAIL",
          "公開できる状態ではありません",
        );
        let active = snapshot;
        if (snapshot.state === "INFRA_FAIL") {
          const resumed = await this.store.append(
            makeEvent(
              snapshot,
              action,
              "INFRA_FAIL",
              "PUBLISH_READY",
              (await this.head(context)).trim(),
              now().toISOString(),
            ),
          );
          active = {
            ...snapshot,
            state: "PUBLISH_READY",
            revision: resumed.sequence,
            eventHash: resumed.eventHash,
          };
        }
        const publication = await this.publicationRequest(context, active);
        const outcome = await this.executeTrustedCapability(
          publication.request,
          publication.targetSha,
        );
        if ("ok" in outcome && outcome.ok) {
          try {
            await this.verifyPublishedRemote(
              context,
              publication.branch,
              publication.targetSha,
            );
          } catch (error: unknown) {
            return this.handleClassifiedFailure(
              classifyFailure({ kind: "policy", code: "RUNNER_BYPASS" }),
              publication.targetSha,
              error instanceof Error ? error.message : "remote mismatch",
            );
          }
        }
        return outcome;
      }
      if (action.action === "record_implementation") {
        stop(
          snapshot.state === "PHASE_RUNNING",
          "implementationを記録できる状態ではありません",
        );
        const currentPhase = requirePhase(phase);
        const guardResult = await this.guardEvent(
          snapshot,
          action,
          context,
          currentPhase,
        );
        if (guardResult) return guardResult;
        if (this.io.context?.head)
          stop(
            (await this.io.context.head(context.worktree)).trim() ===
              action.targetSha,
            "implementation SHAがHEADと不一致です",
          );
        const implementationRecord = implementationEvidenceSchema.parse({
          runId: snapshot.runId,
          planHash: snapshot.planHash,
          phaseId: snapshot.phaseId,
          retryCount: snapshot.retryCount,
          targetSha: action.targetSha,
          actor: action.actor,
          summary: action.summary,
        });
        const evidence = join(this.runDirectory, "implementation.jsonl");
        await parseEvidenceLog(evidence, implementationEvidenceSchema);
        await writeFile(evidence, `${JSON.stringify(implementationRecord)}\n`, {
          encoding: "utf8",
          flag: "a",
        });
        return { revision: snapshot.revision, state: snapshot.state, evidence };
      }
      if (action.action === "begin_phase") {
        const index = context.plan.phases.findIndex(
          (item) => item.id === action.phaseId,
        );
        const current = snapshot.phaseId
          ? context.plan.phases.findIndex(
              (item) => item.id === snapshot.phaseId,
            )
          : -1;
        const retry = snapshot.state === "REWORK" ? snapshot.retryCount + 1 : 0;
        stop(
          index >= 0 &&
            ((snapshot.state === "WORKTREE_READY" && index === 0) ||
              (snapshot.state === "CHECKPOINTED" && index === current + 1) ||
              (snapshot.state === "REWORK" && index === current) ||
              (snapshot.state === "INFRA_FAIL" && index === current)),
          "Phase順序が不正です",
        );
        stop(
          retry <= context.plan.limits.maxRetries,
          "retry上限を超えています",
        );
        const targetSha = await currentHead(context, trustedIO);
        return this.store.append({
          schemaVersion: 1,
          runId: snapshot.runId,
          planHash: snapshot.planHash,
          actor: action.actor,
          occurredAt: now().toISOString(),
          targetSha: targetSha.trim(),
          from: snapshot.state,
          to: "PHASE_RUNNING",
          phaseId: action.phaseId,
          retryCount: retry,
        });
      }
      if (action.action === "begin_verify") {
        stop(
          snapshot.state === "PHASE_RUNNING",
          "verifyを開始できる状態ではありません",
        );
        const currentPhase = requirePhase(phase);
        const guardResult = await this.guardEvent(
          snapshot,
          action,
          context,
          currentPhase,
        );
        if (guardResult) return guardResult;
        const implementationPath = join(
          this.runDirectory,
          "implementation.jsonl",
        );
        try {
          const implementationLines = (
            await readFile(implementationPath, "utf8")
          )
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) =>
              implementationEvidenceSchema.parse(JSON.parse(line) as unknown),
            );
          const head = (await this.head(context)).trim();
          stop(
            implementationLines.some(
              (item) =>
                item.runId === snapshot.runId &&
                item.planHash === snapshot.planHash &&
                item.phaseId === snapshot.phaseId &&
                item.retryCount === snapshot.retryCount &&
                item.targetSha === head,
            ),
            "implementation証跡がありません",
          );
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("STOP:"))
            throw error;
          throw new Error("STOP: implementation証跡が改ざんされています");
        }
        return this.store.append(
          makeEvent(
            snapshot,
            action,
            "PHASE_RUNNING",
            "VERIFYING",
            (await this.head(context)).trim(),
            now().toISOString(),
          ),
        );
      }
      if (action.action === "record_result") {
        stop(
          snapshot.state === "VERIFYING",
          "結果を記録できる状態ではありません",
        );
        const currentPhase = requirePhase(phase);
        const guardResult = await this.guardEvent(
          snapshot,
          action,
          context,
          currentPhase,
        );
        if (guardResult) return guardResult;
        stop(
          currentPhase.qualityGates.includes(action.gateName),
          "未登録quality gateです",
        );
        const currentHead = (await this.head(context)).trim();
        stop(action.targetSha === currentHead, "result SHAがHEADと不一致です");
        stop(
          Date.parse(action.startedAt) <= Date.parse(action.completedAt) &&
            Date.parse(firstEvent.occurredAt) <= Date.parse(action.startedAt) &&
            Date.parse(action.completedAt) <= now().getTime(),
          "quality gate時刻が不正です",
        );
        const path = join(this.runDirectory, "quality-gates.jsonl");
        const gateRecord = gateEvidenceSchema.parse({
          runId: snapshot.runId,
          planHash: snapshot.planHash,
          phaseId: snapshot.phaseId,
          retryCount: snapshot.retryCount,
          gateId: action.gateId,
          gateName: action.gateName,
          exitCode: action.exitCode,
          startedAt: action.startedAt,
          completedAt: action.completedAt,
          targetSha: action.targetSha,
          actor: action.actor,
        });
        const existing = await parseEvidenceLog(path, gateEvidenceSchema);
        stop(
          !existing.some(
            (item) =>
              item.runId === gateRecord.runId &&
              item.phaseId === gateRecord.phaseId &&
              item.retryCount === gateRecord.retryCount &&
              item.gateId === gateRecord.gateId &&
              (item.targetSha !== gateRecord.targetSha ||
                item.exitCode !== gateRecord.exitCode),
          ),
          "quality gate重複証跡が競合しています",
        );
        await writeFile(path, `${JSON.stringify(gateRecord)}\n`, {
          encoding: "utf8",
          flag: "a",
        });
        if (action.exitCode !== 0)
          return this.store.append(
            makeEvent(
              snapshot,
              action,
              "VERIFYING",
              "REWORK",
              action.targetSha,
              now().toISOString(),
            ),
          );
        const records = await parseEvidenceLog(path, gateEvidenceSchema);
        const pendingGates = currentPhase.qualityGates.filter(
          (gate) =>
            !records.some(
              (record) =>
                record.runId === snapshot.runId &&
                record.planHash === snapshot.planHash &&
                record.phaseId === snapshot.phaseId &&
                record.retryCount === snapshot.retryCount &&
                record.gateName === gate &&
                record.exitCode === 0 &&
                record.targetSha === action.targetSha,
            ),
        );
        if (pendingGates.length > 0)
          return {
            revision: snapshot.revision,
            state: snapshot.state,
            pendingGates,
          };
        return this.store.append(
          makeEvent(
            snapshot,
            action,
            "VERIFYING",
            "PHASE_PASSED",
            action.targetSha,
            now().toISOString(),
          ),
        );
      }
      if (action.action === "checkpoint") {
        stop(
          snapshot.state === "PHASE_PASSED",
          "checkpointできる状態ではありません",
        );
        const head = (await this.head(context)).trim();
        stop(head === action.commitSha, "checkpoint SHAがHEADと不一致です");
        const currentPhase = requirePhase(phase);
        const gatePath = join(this.runDirectory, "quality-gates.jsonl");
        const gateRecords = await parseEvidenceLog(
          gatePath,
          gateEvidenceSchema,
        );
        stop(
          currentPhase.qualityGates.every((gate) =>
            gateRecords.some(
              (record) =>
                record.runId === snapshot.runId &&
                record.planHash === snapshot.planHash &&
                record.phaseId === snapshot.phaseId &&
                record.retryCount === snapshot.retryCount &&
                record.gateName === gate &&
                record.exitCode === 0 &&
                record.targetSha === head,
            ),
          ),
          "checkpoint evidenceが不足しています",
        );
        const event = await this.store.append(
          makeEvent(
            snapshot,
            action,
            "PHASE_PASSED",
            "CHECKPOINTED",
            action.commitSha,
            now().toISOString(),
          ),
        );
        if (snapshot.phaseId === context.plan.phases.at(-1)?.id)
          return this.store.append(
            makeEvent(
              {
                ...snapshot,
                state: "CHECKPOINTED",
                revision: event.sequence,
                eventHash: event.eventHash,
              },
              action,
              "CHECKPOINTED",
              "PUBLISH_READY",
              action.commitSha,
              now().toISOString(),
            ),
          );
        return event;
      }
      if (action.action === "quarantine") {
        stop(
          snapshot.state === "SAFETY_VIOLATION",
          "安全違反以外は隔離できません",
        );
        return this.store.append(
          makeEvent(
            snapshot,
            action,
            "SAFETY_VIOLATION",
            "QUARANTINED",
            await this.head(context),
            now().toISOString(),
          ),
        );
      }
      if (action.action === "cleanup")
        throw new Error("STOP: cleanupはPhase 5まで未実装です");
      throw new Error("STOP: actionはこの状態では実行できません");
    } finally {
      await handle.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }
}
