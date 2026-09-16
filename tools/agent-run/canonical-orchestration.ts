import { z } from "zod";
import {
  canonicalStateSchema,
  isCanonicalTransition,
  type CanonicalState,
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
  })
  .strict();
export type CanonicalSnapshot = z.infer<typeof canonicalSnapshotSchema>;

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
