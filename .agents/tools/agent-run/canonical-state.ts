import { createHash } from "node:crypto";
import { z } from "zod";
import { replayEvents, type RunEvent } from "./state-schema";

export const canonicalStates = [
  "DRAFT",
  "APPROVED",
  "READY",
  "RUNNING",
  "VERIFYING",
  "COMPLETED",
  "REPLAN",
  "FAILED",
  "SAFETY_STOP",
] as const;
export const canonicalStateSchema = z.enum(canonicalStates);
export type CanonicalState = z.infer<typeof canonicalStateSchema>;

export const publicationStates = [
  "NOT_STARTED",
  "PENDING",
  "BRANCH_PUSHED",
  "CI_PASSED",
  "PR_CREATED",
  "BLOCKED",
] as const;
export const publicationStateSchema = z.enum(publicationStates);
export type PublicationState = z.infer<typeof publicationStateSchema>;
const publicationEvidenceBase = z
  .object({ pushedSha: z.string().regex(/^[a-f0-9]{40}$/) })
  .strict();
export const publicationEvidenceSchema = z.discriminatedUnion("kind", [
  publicationEvidenceBase.extend({ kind: z.literal("BRANCH_PUSHED") }),
  publicationEvidenceBase.extend({
    kind: z.literal("CI_PASSED"),
    ciUrl: z
      .string()
      .regex(
        /^https:\/\/github\.com\/o289\/new_schedule_app\/actions\/runs\/[1-9][0-9]*$/,
      ),
  }),
  publicationEvidenceBase.extend({
    kind: z.literal("PR_CREATED"),
    url: z
      .string()
      .regex(
        /^https:\/\/github\.com\/o289\/new_schedule_app\/pull\/[1-9][0-9]*$/,
      ),
    head: z.string().min(1),
    base: z.string().min(1),
    headSha: z.string().regex(/^[a-f0-9]{40}$/),
    state: z.literal("OPEN"),
    isDraft: z.literal(false),
  }),
  z
    .object({
      kind: z.literal("BLOCKED"),
      failureCode: z.enum([
        "AUTH",
        "CI",
        "PR",
        "TIMEOUT",
        "REMOTE",
        "INTERNAL",
      ]),
      messageHash: z.string().regex(/^[a-f0-9]{64}$/),
      retryCount: z.number().int().min(0).max(3),
      remoteStateUnknown: z.boolean().optional(),
    })
    .strict(),
]);
export type PublicationEvidence = z.infer<typeof publicationEvidenceSchema>;

export const canonicalTransitions: Readonly<
  Record<CanonicalState, readonly CanonicalState[]>
> = {
  DRAFT: ["APPROVED", "REPLAN", "FAILED", "SAFETY_STOP"],
  APPROVED: ["READY", "REPLAN", "FAILED", "SAFETY_STOP"],
  READY: ["RUNNING", "REPLAN", "FAILED", "SAFETY_STOP"],
  RUNNING: ["VERIFYING", "REPLAN", "FAILED", "SAFETY_STOP"],
  VERIFYING: ["RUNNING", "COMPLETED", "REPLAN", "FAILED", "SAFETY_STOP"],
  COMPLETED: [],
  REPLAN: [],
  FAILED: [],
  SAFETY_STOP: [],
};

export function isCanonicalTransition(
  from: CanonicalState,
  to: CanonicalState,
): boolean {
  return canonicalTransitions[from].includes(to);
}

export const legacyToCanonical: Record<string, CanonicalState> = {
  PREPARED: "DRAFT",
  PLAN_APPROVED: "APPROVED",
  WORKTREE_READY: "READY",
  PHASE_RUNNING: "RUNNING",
  REWORK: "RUNNING",
  CHECKPOINTED: "RUNNING",
  VERIFYING: "VERIFYING",
  PHASE_PASSED: "VERIFYING",
  PUBLISH_READY: "COMPLETED",
  REPLAN_REQUIRED: "REPLAN",
  INFRA_FAIL: "FAILED",
  SAFETY_VIOLATION: "SAFETY_STOP",
  QUARANTINED: "SAFETY_STOP",
  ROLLBACK: "SAFETY_STOP",
  DISCARD: "SAFETY_STOP",
};

export function mapLegacyState(state: string): CanonicalState {
  const mapped = legacyToCanonical[state];
  if (!mapped) throw new Error(`unknown legacy state: ${state}`);
  return mapped;
}

export function projectLegacyEvents(events: readonly RunEvent[]) {
  const legacy = replayEvents(events);
  return {
    runId: legacy.runId,
    planHash: legacy.planHash,
    state: mapLegacyState(legacy.state),
    phaseId: legacy.phaseId,
    retryCount: legacy.retryCount,
    revision: legacy.revision,
    eventHash: legacy.eventHash,
  };
}

export const canonicalEventSchema = z
  .object({
    schemaVersion: z.literal(2),
    sequence: z.number().int().positive(),
    eventHash: z.string().regex(/^[a-f0-9]{64}$/),
    previousEventHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    runId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    from: canonicalStateSchema.nullable(),
    to: canonicalStateSchema,
    phaseId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable(),
    retryCount: z.number().int().min(0).max(3),
    action: z
      .enum([
        "prepare",
        "approve",
        "prepare_workspace",
        "begin_phase",
        "begin_verify",
        "verify_pass",
        "verify_fail",
        "replan",
        "fail",
        "safety_stop",
        "complete",
        "publish",
        "publication_status",
      ])
      .optional(),
    evidence: z
      .object({
        phaseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
        verifiedSha: z.string().regex(/^[a-f0-9]{40}$/),
        gatesPassed: z.literal(true),
      })
      .strict()
      .optional(),
    publicationState: publicationStateSchema.optional(),
    publicationEvidence: publicationEvidenceSchema.optional(),
  })
  .strict();
export type CanonicalEvent = z.infer<typeof canonicalEventSchema>;
export function hashCanonicalEvent(
  event: Omit<CanonicalEvent, "eventHash">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(event).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      ),
    )
    .digest("hex");
}
