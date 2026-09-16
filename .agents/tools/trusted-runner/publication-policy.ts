import { createHash } from "node:crypto";
import { z } from "zod";
import {
  approvalRecordSchema,
  validateApproval,
} from "../agent-run/approval.js";
import { hashPlan } from "../agent-run/plan-hash.js";
import { parsePlan } from "../agent-run/plan-schema.js";
import {
  startRecordSchema,
  validateStart,
  type StartInput,
  type StartInputV2,
} from "../pr-agent-start.js";
import { handoffSchema } from "../pr-agent-publish.js";
import type { PublicationRequest } from "./protocol.js";

const revision = z.number().int().nonnegative();

export const publicationEvidenceSchema = z
  .object({
    startRecord: z.string().min(1),
    plan: z.string().min(1),
    approval: z.string().min(1),
    handoff: z.string().min(1),
    revision,
  })
  .strict();
export type PublicationEvidence = z.infer<typeof publicationEvidenceSchema>;

export type FixedPublicationIntent = {
  capability: PublicationRequest["capability"];
  runId: string;
  planHash: string;
  revision: number;
  targetSha: string;
  startSha: string;
  branch: string;
  base?: string;
  mode: "push_only" | "pull_request";
};

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function parseJson(content: string, name: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
}

function requireCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new Error(`publication intent rejected: ${message}`);
}

function isV2Start(start: StartInput | StartInputV2): start is StartInputV2 {
  return start.schemaVersion === 2;
}

/**
 * Resolves the immutable branch data from a completed start record. The caller
 * cannot supply a remote, refspec, base, or command as part of the intent.
 */
export function validatePublicationIntent(
  request: PublicationRequest,
  rawEvidence: unknown,
  now = new Date(),
): FixedPublicationIntent {
  const evidence = publicationEvidenceSchema.parse(rawEvidence);
  requireCondition(
    request.revision === evidence.revision,
    "runner revision does not match canonical revision",
  );
  requireCondition(
    contentHash(evidence.startRecord) ===
      request.args.canonicalContext.startRecordSha256,
    "start record hash mismatch",
  );
  requireCondition(
    contentHash(evidence.approval) ===
      request.args.canonicalContext.approvalSha256,
    "approval hash mismatch",
  );
  requireCondition(
    contentHash(evidence.handoff) ===
      request.args.canonicalContext.handoffSha256,
    "handoff hash mismatch",
  );

  const plan = parsePlan(parseJson(evidence.plan, "plan"));
  requireCondition(plan.runId === request.runId, "plan runId mismatch");
  requireCondition(hashPlan(plan) === request.planHash, "plan hash mismatch");

  const approval = approvalRecordSchema.parse(
    parseJson(evidence.approval, "approval"),
  );
  validateApproval(approval, evidence.plan, now);
  requireCondition(
    approval.runId === request.runId &&
      approval.planHash === request.planHash &&
      approval.plan.sha256 === contentHash(evidence.plan),
    "approval does not reference the canonical plan",
  );

  // startRecordSchema intentionally accepts only completed v1 records for
  // history. New inputs are parsed elsewhere by startInputV2Schema.
  const start = startRecordSchema.parse(
    parseJson(evidence.startRecord, "start record"),
  );
  validateStart(start);
  requireCondition(
    start.plan.sha256 === contentHash(evidence.plan),
    "start record plan hash mismatch",
  );
  if (isV2Start(start)) {
    requireCondition(
      start.plan.runId === request.runId &&
        start.plan.planHash === request.planHash &&
        start.approval.runId === request.runId &&
        start.approval.planHash === request.planHash &&
        start.approval.sha256 === contentHash(evidence.approval),
      "v2 start record does not reference canonical approval",
    );
  }

  const handoff = handoffSchema.parse(parseJson(evidence.handoff, "handoff"));
  requireCondition(
    handoff.head === start.head &&
      handoff.mode === start.mode &&
      handoff.reviewBaseSha === start.reviewBaseSha &&
      handoff.start.sha256 === contentHash(evidence.startRecord) &&
      handoff.plan.sha256 === contentHash(evidence.plan),
    "handoff does not reference the completed start record",
  );
  requireCondition(
    request.args.targetSha === request.args.canonicalContext.headSha &&
      request.args.targetSha === handoff.headSha,
    "target SHA does not match canonical HEAD",
  );

  if (start.mode === "push_only") {
    requireCondition(
      handoff.mode === "push_only",
      "push-only handoff mode mismatch",
    );
    return {
      capability: request.capability,
      runId: request.runId,
      planHash: request.planHash,
      revision: request.revision,
      targetSha: request.args.targetSha,
      startSha: start.reviewBaseSha,
      branch: start.head,
      mode: start.mode,
    };
  }

  requireCondition(
    handoff.mode === "pull_request" && handoff.base === start.sourceBranch,
    "pull request base is not fixed by the start record",
  );
  return {
    capability: request.capability,
    runId: request.runId,
    planHash: request.planHash,
    revision: request.revision,
    targetSha: request.args.targetSha,
    startSha: start.reviewBaseSha,
    branch: start.head,
    base: start.sourceBranch,
    mode: start.mode,
  };
}
