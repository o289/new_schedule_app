import {
  validatePublicationIntent,
  type PublicationEvidence,
} from "./publication-policy";
import { createHash } from "node:crypto";
import type { PublicationRequest } from "./protocol";
import { TrustedRunnerClient } from "./client";

/**
 * Single publication-policy boundary shared by legacy and canonical callers.
 * It intentionally accepts only evidence and a typed request; branch, target
 * and credentials are never supplied by an agent command-line request.
 */
export function validateTrustedPublication(
  request: PublicationRequest,
  evidence: PublicationEvidence,
  now: Date,
) {
  return validatePublicationIntent(request, evidence, now);
}

export function buildTrustedPublicationRequest(input: {
  runId: string;
  planHash: string;
  revision: number;
  targetSha: string;
  plan: string;
  approval: string;
  startRecord: string;
  handoff: string;
}): PublicationRequest {
  const contentHash = (content: string) =>
    createHash("sha256").update(content, "utf8").digest("hex");
  return {
    protocolVersion: "1",
    runId: input.runId,
    planHash: input.planHash,
    revision: input.revision,
    capability: "publish_approved_sha",
    args: {
      targetSha: input.targetSha,
      canonicalContext: {
        startRecordSha256: contentHash(input.startRecord),
        approvalSha256: contentHash(input.approval),
        handoffSha256: contentHash(input.handoff),
        headSha: input.targetSha,
      },
    },
    nonce: TrustedRunnerClient.createNonce(),
  };
}
