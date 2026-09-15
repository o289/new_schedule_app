import { createHash } from "node:crypto";
import { z } from "zod";
import { assertPlanApprovable, parsePlan } from "./plan-schema";
import { hashPlan } from "./plan-hash";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);
const ref = z.object({ path: nonempty, sha256: digest }).strict();
export const approvalInputSchema = z
  .object({
    schemaVersion: z.literal(2),
    runId: nonempty,
    plan: ref,
    planHash: digest,
    approvedBy: nonempty,
    approvedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const approvalRecordSchema = approvalInputSchema
  .extend({ completed: z.literal(true) })
  .strict();
export type ApprovalInput = z.infer<typeof approvalInputSchema>;
export interface ApprovalIO {
  read: (path: string) => Promise<string>;
  writeExclusive: (path: string, content: string) => Promise<void>;
}
function stop(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`STOP: ${message}`);
}
export function validateApproval(
  input: ApprovalInput,
  planContent: string,
  now: Date,
): void {
  const plan = parsePlan(JSON.parse(planContent) as unknown);
  assertPlanApprovable(plan);
  stop(plan.runId === input.runId, "runIdが一致しません");
  stop(hashPlan(plan) === input.planHash, "canonical planのhashが不一致です");
  stop(
    createHash("sha256").update(planContent).digest("hex") ===
      input.plan.sha256,
    "計画ファイルのhashが不一致です",
  );
  const approved = Date.parse(input.approvedAt);
  const expires = Date.parse(input.expiresAt);
  const current = now.getTime();
  stop(approved < expires, "approvedAtはexpiresAtより前である必要があります");
  stop(expires - approved <= 7 * 24 * 60 * 60 * 1000, "承認期間は最大7日です");
  stop(current >= approved && current < expires, "承認の有効期限外です");
}
export async function createApproval(
  input: unknown,
  io: ApprovalIO,
  now = new Date(),
): Promise<z.infer<typeof approvalRecordSchema>> {
  const parsed = approvalInputSchema.parse(input);
  const content = await io.read(parsed.plan.path);
  validateApproval(parsed, content, now);
  const record = { ...parsed, completed: true as const };
  await io.writeExclusive(
    "approval.json",
    JSON.stringify(record, null, 2) + "\n",
  );
  return record;
}
