import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);
const artifact = z.object({ path: nonempty, sha256: digest }).strict();
const passed = z
  .object({ status: z.literal("PASS"), evidence: artifact })
  .strict();
const optionalGate = z.discriminatedUnion("status", [
  passed,
  z.object({ status: z.literal("NOT_REQUIRED"), reason: nonempty }).strict(),
]);
const commonHandoffSchema = z
  .object({
    schemaVersion: z.literal(2),
    head: nonempty,
    headSha: sha,
    reviewBaseSha: sha,
    start: artifact,
    plan: artifact,
    implementation: artifact,
    allPhasesComplete: z.literal(true),
    quality: z
      .object({
        final: z.literal("PASS"),
        verifyPhase: passed,
        integration: optionalGate,
        e2e: optionalGate,
      })
      .strict(),
    changes: z
      .object({
        db: z.boolean(),
        dependencies: z.boolean(),
        configuration: z.boolean(),
        generated: z.boolean(),
      })
      .strict(),
    review: z
      .object({
        diffSha256: digest,
        classification: artifact,
        allDiffClassified: z.literal(true),
        unclassified: z.literal(0),
        safetyReview: artifact,
        noSecretsOrDebug: z.literal(true),
        noUnapprovedChanges: z.literal(true),
        destructiveMigrationApproved: z.literal(true),
        html: artifact,
      })
      .strict(),
  })
  .strict();
const versionBranch = /^feature\/v\d+\.\d+\.\d+$/;
const featureBranch = /^feature\/[A-Za-z0-9][A-Za-z0-9_-]*-v(\d+\.\d+\.\d+)$/;
const prDiffReviewSchema = z
  .object({
    diffSha256: digest,
    classification: artifact,
    allDiffClassified: z.literal(true),
    unclassified: z.literal(0),
  })
  .strict();
export const handoffSchema = z
  .discriminatedUnion("mode", [
    commonHandoffSchema.extend({
      mode: z.literal("push_only"),
      head: nonempty.regex(versionBranch),
    }),
    commonHandoffSchema
      .extend({
        mode: z.literal("pull_request"),
        head: nonempty.regex(featureBranch),
        base: nonempty.optional(),
        baseSha: sha,
        prReview: prDiffReviewSchema,
        title: nonempty.max(200),
        body: artifact,
      })
      .superRefine((input, context) => {
        if (
          input.base !== undefined &&
          input.base !== `feature/v${featureBranch.exec(input.head)?.[1]}`
        )
          context.addIssue({
            code: "custom",
            message: "headとPR baseのバージョンが不一致です",
            path: ["base"],
          });
      }),
  ])
  .transform((input) =>
    input.mode === "pull_request"
      ? { ...input, base: `feature/v${featureBranch.exec(input.head)?.[1]}` }
      : input,
  );
export type Handoff = z.infer<typeof handoffSchema>;

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function validateBranches(
  mode: "push_only" | "pull_request",
  head: string,
  base?: string,
): void {
  if (mode === "push_only") {
    if (!versionBranch.test(head) || base !== undefined)
      throw new Error("STOP: 版branchのpush_onlyにPR baseは指定できません");
    return;
  }
  const version = featureBranch.exec(head)?.[1];
  if (
    version === undefined ||
    (base !== undefined && base !== `feature/v${version}`)
  )
    throw new Error("STOP: 機能branchのPR先は同じバージョンに固定です");
}

/** Publication mutation is available only through the trusted runner. */
export function parsePublicationHandoff(input: unknown): Handoff {
  const handoff = handoffSchema.parse(input);
  validateBranches(
    handoff.mode,
    handoff.head,
    handoff.mode === "pull_request" ? handoff.base : undefined,
  );
  return handoff;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.error(
    "STOP: direct publication is disabled; use the trusted runner.",
  );
  process.exitCode = 1;
}
