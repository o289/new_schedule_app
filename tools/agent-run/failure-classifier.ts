import { z } from "zod";

const failureSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("runner"),
      code: z.enum([
        "NOT_CONNECTED",
        "TIMEOUT",
        "PROTOCOL_MISMATCH",
        "CONNECTION_ERROR",
        "NONZERO",
      ]),
      message: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("verification"),
      code: z.enum(["TEST_FAILURE", "TYPE_FAILURE"]),
      message: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("policy"),
      code: z.enum([
        "CAPABILITY_UNAVAILABLE",
        "NOT_IMPLEMENTED",
        "SECRET_DETECTED",
        "FORBIDDEN_DB_CONNECTION",
        "PATH_VIOLATION",
        "RUNNER_BYPASS",
      ]),
      message: z.string().optional(),
    })
    .strict(),
]);
export type FailureInput = z.infer<typeof failureSchema>;
export type FailureClassification =
  "INFRA_FAIL" | "REWORK" | "REPLAN_REQUIRED" | "SAFETY_VIOLATION";
export type ClassifiedFailure = {
  classification: FailureClassification;
  reasonCode: FailureInput["code"];
  safeMessage: string;
  revokeCapabilities: boolean;
  quarantine: boolean;
};
export type CanonicalFailureOutcome = "REPLAN" | "FAILED" | "SAFETY_STOP";

/** Adapts the legacy classifier without changing its public classification. */
export function toCanonicalFailureOutcome(
  failure: ClassifiedFailure,
): CanonicalFailureOutcome {
  if (failure.classification === "REPLAN_REQUIRED") return "REPLAN";
  if (failure.classification === "SAFETY_VIOLATION") return "SAFETY_STOP";
  return "FAILED";
}

const safeMessage = (code: string): string => `trusted runner failure: ${code}`;
export function classifyFailure(input: unknown): ClassifiedFailure {
  const failure = failureSchema.parse(input);
  if (failure.kind === "runner")
    return {
      classification: failure.code === "NONZERO" ? "REWORK" : "INFRA_FAIL",
      reasonCode: failure.code,
      safeMessage: safeMessage(failure.code),
      revokeCapabilities: false,
      quarantine: false,
    };
  if (failure.kind === "verification")
    return {
      classification: "REWORK",
      reasonCode: failure.code,
      safeMessage: safeMessage(failure.code),
      revokeCapabilities: false,
      quarantine: false,
    };
  const safety = [
    "SECRET_DETECTED",
    "FORBIDDEN_DB_CONNECTION",
    "PATH_VIOLATION",
    "RUNNER_BYPASS",
  ].includes(failure.code);
  return {
    classification: safety ? "SAFETY_VIOLATION" : "REPLAN_REQUIRED",
    reasonCode: failure.code,
    safeMessage: safeMessage(failure.code),
    revokeCapabilities: safety,
    quarantine: safety,
  };
}
