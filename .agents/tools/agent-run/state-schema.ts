import { createHash } from "node:crypto";
import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const commitSha = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const runStates = [
  "PREPARED",
  "PLAN_APPROVED",
  "WORKTREE_READY",
  "PHASE_RUNNING",
  "VERIFYING",
  "PHASE_PASSED",
  "CHECKPOINTED",
  "PUBLISH_READY",
  "REWORK",
  "REPLAN_REQUIRED",
  "INFRA_FAIL",
  "SAFETY_VIOLATION",
  "QUARANTINED",
  "ROLLBACK",
  "DISCARD",
] as const;
export const runStateSchema = z.enum(runStates);
export type RunState = z.infer<typeof runStateSchema>;

const phaseId = identifier.nullable();
export const eventSchema = z
  .object({
    schemaVersion: z.literal(1),
    sequence: z.number().int().positive(),
    eventHash: digest,
    previousEventHash: digest.nullable(),
    runId: identifier,
    planHash: digest,
    actor: z.string().trim().min(1),
    occurredAt: z.string().datetime({ offset: true }),
    targetSha: commitSha,
    from: runStateSchema.nullable(),
    to: runStateSchema,
    phaseId,
    retryCount: z.number().int().min(0).max(3),
  })
  .strict();
export type RunEvent = z.infer<typeof eventSchema>;

export const snapshotSchema = z
  .object({
    runId: identifier,
    planHash: digest,
    state: runStateSchema,
    phaseId,
    retryCount: z.number().int().min(0).max(3),
    revision: z.number().int().nonnegative(),
    eventHash: digest.nullable(),
  })
  .strict();
export type RunSnapshot = z.infer<typeof snapshotSchema>;

export const allowedTransitions: Readonly<
  Record<RunState | "START", readonly RunState[]>
> = {
  START: ["PREPARED"],
  PREPARED: ["PLAN_APPROVED", "REPLAN_REQUIRED", "INFRA_FAIL"],
  PLAN_APPROVED: ["WORKTREE_READY", "REPLAN_REQUIRED", "INFRA_FAIL"],
  WORKTREE_READY: ["PHASE_RUNNING", "INFRA_FAIL", "SAFETY_VIOLATION"],
  PHASE_RUNNING: [
    "VERIFYING",
    "REWORK",
    "REPLAN_REQUIRED",
    "INFRA_FAIL",
    "SAFETY_VIOLATION",
  ],
  VERIFYING: [
    "PHASE_PASSED",
    "REWORK",
    "REPLAN_REQUIRED",
    "INFRA_FAIL",
    "SAFETY_VIOLATION",
  ],
  PHASE_PASSED: ["CHECKPOINTED"],
  CHECKPOINTED: ["PHASE_RUNNING", "PUBLISH_READY"],
  PUBLISH_READY: ["INFRA_FAIL", "REPLAN_REQUIRED", "SAFETY_VIOLATION"],
  REWORK: ["PHASE_RUNNING", "REPLAN_REQUIRED"],
  REPLAN_REQUIRED: [],
  INFRA_FAIL: ["REWORK", "PHASE_RUNNING", "PUBLISH_READY"],
  SAFETY_VIOLATION: ["QUARANTINED"],
  QUARANTINED: ["ROLLBACK", "DISCARD"],
  ROLLBACK: [],
  DISCARD: [],
};

function eventBody(event: Omit<RunEvent, "eventHash"> | RunEvent): string {
  const { eventHash: _eventHash, ...body } = event as RunEvent;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(body).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}
export function hashEvent(
  event: Omit<RunEvent, "eventHash"> | RunEvent,
): string {
  return createHash("sha256").update(eventBody(event), "utf8").digest("hex");
}
export function isAllowedTransition(
  from: RunState | null,
  to: RunState,
): boolean {
  return allowedTransitions[from ?? "START"].includes(to);
}

export function replayEvents(events: readonly unknown[]): RunSnapshot {
  let snapshot: RunSnapshot | undefined;
  const seenPhases = new Set<string>();
  for (const [index, raw] of events.entries()) {
    const event = eventSchema.parse(raw);
    if (event.sequence !== index + 1)
      throw new Error("event sequenceが連番ではありません");
    if (
      event.runId !== (snapshot?.runId ?? event.runId) ||
      event.planHash !== (snapshot?.planHash ?? event.planHash)
    )
      throw new Error("runIdまたはplanHashが一致しません");
    if (event.previousEventHash !== (snapshot?.eventHash ?? null))
      throw new Error("event hash chainが不一致です");
    if (hashEvent(event) !== event.eventHash)
      throw new Error("event hashが不一致です");
    if (
      event.from !== (snapshot?.state ?? null) ||
      !isAllowedTransition(event.from, event.to)
    )
      throw new Error("不正なstate transitionです");
    if (event.to === "PREPARED" && snapshot)
      throw new Error("runの二重開始です");
    const previousPhase = snapshot?.phaseId ?? null;
    const previousRetry = snapshot?.retryCount ?? 0;
    const phaseStates = new Set<RunState>([
      "PHASE_RUNNING",
      "VERIFYING",
      "PHASE_PASSED",
      "REWORK",
      "CHECKPOINTED",
      "PUBLISH_READY",
    ]);
    const safetyStates = new Set<RunState>([
      "SAFETY_VIOLATION",
      "QUARANTINED",
      "ROLLBACK",
      "DISCARD",
    ]);
    if (event.to === "PHASE_RUNNING") {
      if (!event.phaseId) throw new Error("PHASE_RUNNINGにはphaseIdが必要です");
      if (event.from === "REWORK") {
        if (
          event.phaseId !== previousPhase ||
          event.retryCount !== previousRetry + 1
        )
          throw new Error("REWORKのretryが不正です");
      } else if (event.from === "INFRA_FAIL" && previousPhase) {
        if (
          event.phaseId !== previousPhase ||
          event.retryCount !== previousRetry
        )
          throw new Error("INFRA_FAIL復帰のPhaseが不一致です");
      } else if (
        event.from === "WORKTREE_READY" ||
        event.from === "CHECKPOINTED" ||
        event.from === "INFRA_FAIL"
      ) {
        if (event.retryCount !== 0 || seenPhases.has(event.phaseId))
          throw new Error("新しいPhaseの開始が不正です");
      }
      seenPhases.add(event.phaseId);
    } else if (event.to === "INFRA_FAIL") {
      if (previousPhase) {
        if (
          event.phaseId !== previousPhase ||
          event.retryCount !== previousRetry
        )
          throw new Error("Phase中INFRA_FAILの証跡が不一致です");
      } else if (event.phaseId !== null || event.retryCount !== 0) {
        throw new Error("Phase外INFRA_FAILにPhase情報を指定できません");
      }
    } else if (phaseStates.has(event.to)) {
      if (
        !event.phaseId ||
        event.phaseId !== previousPhase ||
        event.retryCount !== previousRetry
      )
        throw new Error("PhaseのphaseIdまたはretryが不整合です");
    } else if (safetyStates.has(event.to)) {
      if (event.phaseId && event.phaseId !== previousPhase)
        throw new Error("安全隔離のphaseIdが不一致です");
      if (event.retryCount !== previousRetry)
        throw new Error("安全隔離のretryが不一致です");
    } else if (event.phaseId !== null || event.retryCount !== 0) {
      throw new Error("Phase外状態にphaseIdまたはretryを指定できません");
    }
    snapshot = {
      runId: event.runId,
      planHash: event.planHash,
      state: event.to,
      phaseId: event.phaseId,
      retryCount: event.retryCount,
      revision: event.sequence,
      eventHash: event.eventHash,
    };
  }
  if (!snapshot) throw new Error("event chainが空です");
  return snapshotSchema.parse(snapshot);
}

export function createEvent(input: Omit<RunEvent, "eventHash">): RunEvent {
  return eventSchema.parse({ ...input, eventHash: hashEvent(input) });
}
