import { z } from "zod";
import {
  canonicalStateSchema,
  isCanonicalTransition,
  type CanonicalState,
} from "./canonical-state";
import {
  publicationStateSchema,
  type PublicationState,
  publicationEvidenceSchema,
} from "./canonical-state";

export const canonicalActionSchema = z.enum([
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
]);
export type CanonicalAction = z.infer<typeof canonicalActionSchema>;
const outcomeSchema = z.enum(["REPLAN", "FAILED", "SAFETY_STOP"]);
export type CanonicalOutcome = z.infer<typeof outcomeSchema>;
export const canonicalSnapshotSchema = z
  .object({
    state: canonicalStateSchema,
    phaseId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable(),
    retryCount: z.number().int().min(0).max(3),
    publicationState: publicationStateSchema.default("NOT_STARTED"),
    publicationEvidence: publicationEvidenceSchema.optional(),
  })
  .strict();
export type CanonicalSnapshot = z.infer<typeof canonicalSnapshotSchema>;

export const publicationTransitionSchema = z
  .object({
    from: publicationStateSchema,
    to: publicationStateSchema,
  })
  .strict();

const publicationTransitions: Readonly<
  Record<PublicationState, readonly PublicationState[]>
> = {
  NOT_STARTED: ["PENDING"],
  PENDING: ["BRANCH_PUSHED", "BLOCKED"],
  BRANCH_PUSHED: ["CI_PASSED", "BLOCKED"],
  CI_PASSED: ["PR_CREATED", "BLOCKED"],
  PR_CREATED: [],
  BLOCKED: [],
};

export function resolvePublicationTransition(
  from: unknown,
  to: unknown,
): PublicationState {
  const transition = publicationTransitionSchema.parse({ from, to });
  if (!publicationTransitions[transition.from].includes(transition.to)) {
    throw new Error("許可されない公開状態遷移です");
  }
  return transition.to;
}

export const publicationTransitionContextSchema = z
  .object({
    implementationState: canonicalStateSchema,
    publicationState: publicationStateSchema,
  })
  .strict();

export function resolvePublicationTransitionForSnapshot(
  snapshot: unknown,
  to: unknown,
): PublicationState {
  const current = publicationTransitionContextSchema.parse(snapshot);
  if (to === "PENDING" && current.implementationState !== "COMPLETED") {
    throw new Error("実装完了前に公開処理を開始できません");
  }
  return resolvePublicationTransition(current.publicationState, to);
}

export const publicationCompletionInputSchema = z
  .object({
    mode: z.enum(["push_only", "pull_request"]),
    implementationState: canonicalStateSchema,
    publicationState: publicationStateSchema,
    targetSha: z.string().regex(/^[a-f0-9]{40}$/),
    verifiedSha: z.string().regex(/^[a-f0-9]{40}$/),
    head: z.string().min(1),
    base: z.string().min(1).optional(),
    prHead: z.string().min(1).optional(),
    prBase: z.string().min(1).optional(),
    prSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    prUrl: z
      .string()
      .url()
      .regex(/^https:\/\/github\.com\/o289\/new_schedule_app\/pull\/[0-9]+$/)
      .optional(),
    prState: z.enum(["OPEN", "CLOSED", "MERGED"]).optional(),
    isDraft: z.boolean().optional(),
  })
  .strict();

export function isFinalResponseAllowed(input: unknown): boolean {
  const value = publicationCompletionInputSchema.parse(input);
  if (value.implementationState !== "COMPLETED") return false;
  if (value.targetSha !== value.verifiedSha) return false;
  if (value.mode === "push_only") {
    return value.publicationState === "CI_PASSED";
  }
  return (
    value.publicationState === "PR_CREATED" &&
    value.base !== undefined &&
    value.prHead === value.head &&
    value.prBase === value.base &&
    value.prSha === value.targetSha &&
    value.prUrl !== undefined &&
    value.prState === "OPEN" &&
    value.isDraft === false
  );
}

export function resolveCanonicalTransition(
  snapshot: CanonicalSnapshot,
  action: unknown,
  phaseId: string | null = snapshot.phaseId,
  outcome?: unknown,
): CanonicalSnapshot {
  const current = canonicalSnapshotSchema.parse(snapshot);
  const name = canonicalActionSchema.parse(action);
  const nextPhaseId = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable()
    .parse(phaseId);

  if (outcome !== undefined) outcomeSchema.parse(outcome);

  if (name === "verify_fail" && outcome !== undefined && outcome !== "FAILED") {
    const target = outcome === "REPLAN" ? "REPLAN" : "SAFETY_STOP";
    if (!isCanonicalTransition(current.state, target)) {
      throw new Error("終端stateから遷移できません");
    }
    return { ...current, state: target };
  }

  if (name === "prepare" && current.state === "DRAFT") {
    return current;
  }

  if (["replan", "fail", "safety_stop"].includes(name)) {
    const target =
      name === "replan" ? "REPLAN" : name === "fail" ? "FAILED" : "SAFETY_STOP";
    if (!isCanonicalTransition(current.state, target)) {
      throw new Error("終端stateから遷移できません");
    }
    return { ...current, state: target };
  }

  if (name === "verify_fail") {
    if (current.state !== "VERIFYING") {
      throw new Error("VERIFYING以外の失敗です");
    }
    if (current.retryCount >= 3) return { ...current, state: "FAILED" };
    return {
      ...current,
      state: "RUNNING",
      phaseId: nextPhaseId,
      retryCount: current.retryCount + 1,
    };
  }

  const next: Partial<Record<CanonicalAction, CanonicalState>> = {
    approve: "APPROVED",
    prepare_workspace: "READY",
    begin_phase: "RUNNING",
    begin_verify: "VERIFYING",
    verify_pass:
      current.state === "VERIFYING" && nextPhaseId !== current.phaseId
        ? "RUNNING"
        : "COMPLETED",
    complete: "COMPLETED",
    publish: "COMPLETED",
  };
  const target = next[name];
  if (!target || !isCanonicalTransition(current.state, target)) {
    throw new Error("許可されないcanonical遷移です");
  }
  return {
    state: target,
    phaseId:
      target === "RUNNING" || target === "VERIFYING"
        ? nextPhaseId
        : current.phaseId,
    retryCount: current.retryCount,
    publicationState: current.publicationState,
  };
}

export const publicationEligibilitySchema = z
  .object({
    state: z.literal("COMPLETED"),
    canonicalContextVerified: z.literal(true),
    planHashValid: z.literal(true),
    approvalHashValid: z.literal(true),
    startHashValid: z.literal(true),
    allPhasesPassed: z.literal(true),
    targetSha: z.string().regex(/^[a-f0-9]{40}$/),
    verifiedSha: z.string().regex(/^[a-f0-9]{40}$/),
    publicationBoundaryRevalidated: z.literal(true),
    legacyProjection: z.literal(false),
  })
  .strict();

export function isPublicationEligible(input: unknown): boolean {
  const value = publicationEligibilitySchema.parse(input);
  return value.targetSha === value.verifiedSha;
}
