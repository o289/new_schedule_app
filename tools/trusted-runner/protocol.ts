import { z } from "zod";

export const trustedRunnerProtocolVersion = "1" as const;
export const trustedRunnerMaxFrameBytes = 64 * 1024;
export const trustedRunnerCapabilities = [
  "prepare_run",
  "verify_phase",
  "apply_migration_local",
  "run_e2e",
  "checkpoint",
  "promote_ff_only",
  "publish_approved_sha",
  "quarantine_run",
] as const;
const capabilitySchema = z.enum(trustedRunnerCapabilities);

const runIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/);
const planHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const nonceSchema = z.string().regex(/^[a-f0-9]{32}$/);
const revisionSchema = z.number().int().nonnegative();

const phaseIdSchema = z.string().regex(/^phase-[1-9][0-9]*$/);
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const textFactSchema = z.string().min(1).max(128);
const publicationContextSchema = z
  .object({
    startRecordSha256: planHashSchema,
    approvalSha256: planHashSchema,
    handoffSha256: planHashSchema,
    headSha: shaSchema,
  })
  .strict();
const publicationArgsSchema = z
  .object({
    targetSha: shaSchema,
    canonicalContext: publicationContextSchema,
  })
  .strict();
const argsByCapability = {
  prepare_run: z.object({ phaseId: phaseIdSchema }).strict(),
  verify_phase: z.object({ phaseId: phaseIdSchema }).strict(),
  apply_migration_local: z
    .object({
      migrationName: textFactSchema,
      databaseName: textFactSchema,
      approvalId: textFactSchema,
      backupRef: textFactSchema,
      rollbackRef: textFactSchema,
    })
    .strict(),
  run_e2e: z.object({ phaseId: phaseIdSchema }).strict(),
  checkpoint: z.object({ phaseId: phaseIdSchema }).strict(),
  promote_ff_only: publicationArgsSchema,
  publish_approved_sha: publicationArgsSchema,
  quarantine_run: z
    .object({
      reasonCode: z.enum([
        "SAFETY_VIOLATION",
        "SECRET_DETECTED",
        "PATH_VIOLATION",
        "RUNNER_BYPASS",
      ]),
    })
    .strict(),
} as const;
const requestFields = {
  protocolVersion: z.literal(trustedRunnerProtocolVersion),
  runId: runIdSchema,
  planHash: planHashSchema,
  revision: revisionSchema,
  nonce: nonceSchema,
};

const requestSchemas = [
  z
    .object({
      ...requestFields,
      capability: z.literal("prepare_run"),
      args: argsByCapability.prepare_run,
    })
    .strict(),
  z
    .object({
      ...requestFields,
      capability: z.literal("verify_phase"),
      args: argsByCapability.verify_phase,
    })
    .strict(),
  z
    .object({
      ...requestFields,
      capability: z.literal("apply_migration_local"),
      args: argsByCapability.apply_migration_local,
    })
    .strict(),
  z
    .object({
      ...requestFields,
      capability: z.literal("run_e2e"),
      args: argsByCapability.run_e2e,
    })
    .strict(),
  z
    .object({
      ...requestFields,
      capability: z.literal("checkpoint"),
      args: argsByCapability.checkpoint,
    })
    .strict(),
  z
    .object({
      ...requestFields,
      capability: z.literal("promote_ff_only"),
      args: argsByCapability.promote_ff_only,
    })
    .strict(),
  z
    .object({
      ...requestFields,
      capability: z.literal("publish_approved_sha"),
      args: argsByCapability.publish_approved_sha,
    })
    .strict(),
  z
    .object({
      ...requestFields,
      capability: z.literal("quarantine_run"),
      args: argsByCapability.quarantine_run,
    })
    .strict(),
] as const;

export const trustedRunnerRequestSchema = z.discriminatedUnion(
  "capability",
  requestSchemas,
);
export type TrustedRunnerRequest = z.infer<typeof trustedRunnerRequestSchema>;
export type PublicationRequest = Extract<
  TrustedRunnerRequest,
  {
    capability: "promote_ff_only" | "publish_approved_sha";
  }
>;
export type PublicationCanonicalContext = z.infer<
  typeof publicationContextSchema
>;

const resultSchema = z
  .object({
    exitCode: z.number().int().min(-1).max(255),
    durationMs: z.number().int().nonnegative(),
    truncated: z.boolean(),
    stdoutHash: z.string().regex(/^[a-f0-9]{64}$/),
    stderrHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const errorSchema = z
  .object({
    code: z.enum([
      "INVALID_REQUEST",
      "UNKNOWN_CAPABILITY",
      "NONCE_REUSED",
      "TIMEOUT",
      "PROTOCOL_MISMATCH",
      "CONNECTION_ERROR",
      "INTERNAL_ERROR",
    ]),
    message: z.string().min(1).max(256),
  })
  .strict();

export const trustedRunnerResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      protocolVersion: z.literal(trustedRunnerProtocolVersion),
      runId: runIdSchema,
      planHash: planHashSchema,
      revision: revisionSchema,
      capability: capabilitySchema,
      nonce: nonceSchema,
      result: resultSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      protocolVersion: z.literal(trustedRunnerProtocolVersion),
      runId: runIdSchema,
      planHash: planHashSchema,
      revision: revisionSchema,
      capability: capabilitySchema,
      nonce: nonceSchema,
      error: errorSchema,
    })
    .strict(),
]);
export type TrustedRunnerResponse = z.infer<typeof trustedRunnerResponseSchema>;

export function encodeTrustedRunnerFrame(
  value: TrustedRunnerRequest | TrustedRunnerResponse,
): Buffer {
  const json = JSON.stringify(value);
  const frame = Buffer.from(`${json}\n`, "utf8");
  if (frame.byteLength > trustedRunnerMaxFrameBytes) {
    throw new Error("trusted runner frame exceeds maximum size");
  }
  return frame;
}

export function parseTrustedRunnerRequest(line: string): TrustedRunnerRequest {
  if (line.includes("\n") || line.includes("\r"))
    throw new Error("multiple frames are not allowed");
  if (Buffer.byteLength(line, "utf8") > trustedRunnerMaxFrameBytes)
    throw new Error("oversize frame");
  const parsed: unknown = JSON.parse(line);
  return trustedRunnerRequestSchema.parse(parsed);
}

export function parseTrustedRunnerResponse(
  line: string,
): TrustedRunnerResponse {
  if (line.includes("\n") || line.includes("\r"))
    throw new Error("multiple frames are not allowed");
  if (Buffer.byteLength(line, "utf8") > trustedRunnerMaxFrameBytes)
    throw new Error("oversize frame");
  const parsed: unknown = JSON.parse(line);
  return trustedRunnerResponseSchema.parse(parsed);
}
