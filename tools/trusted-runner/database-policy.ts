import { z } from "zod";

const databaseRequestSchema = z
  .object({
    migrationName: z.string().min(1).max(128),
    databaseUrl: z.string().min(1).max(2048),
    role: z.string().min(1).max(128),
    databaseName: z.literal("development"),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    approvalId: z.string().min(1).max(128),
    backupRef: z.string().min(1).max(256),
    rollbackRef: z.string().min(1).max(256),
    destructiveSql: z.string().max(10000).optional(),
  })
  .strict();
export type DatabasePolicyRequest = z.infer<typeof databaseRequestSchema>;
const canonicalApprovalSchema = z
  .object({
    approvalId: z.string().min(1).max(128),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    changeUnit: z.literal("APPROVED"),
    backupRef: z.string().min(1).max(256),
    rollbackRef: z.string().min(1).max(256),
  })
  .strict();
export type CanonicalApprovalEvidence = z.infer<typeof canonicalApprovalSchema>;
const e2eRequestSchema = z.object({ url: z.string().url() }).strict();
export type E2EPolicyRequest = z.infer<typeof e2eRequestSchema>;
export const databasePolicyRequestSchema = databaseRequestSchema;
export function validateDatabaseRequest(
  input: unknown,
  trustedApproval?: unknown,
): DatabasePolicyRequest {
  const request = databaseRequestSchema.parse(input);
  const parsed = parseDatabaseUrl(request.databaseUrl);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    parsed.protocol !== "postgresql:" ||
    !["localhost", "127.0.0.1", "::1", "postgresql"].includes(host)
  )
    throw new Error("database host is not local");
  if (
    /prod|staging|cloud|root|admin/i.test(request.role) ||
    /prod|staging|cloud/i.test(parsed.username)
  )
    throw new Error("production role is forbidden");
  if (
    parsed.password ||
    parsed.username.includes("%") ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/development"
  )
    throw new Error("database query options are forbidden");
  const isDestructive =
    request.destructiveSql !== undefined &&
    /\b(drop|truncate|delete|alter|update)\b/i.test(request.destructiveSql);
  if (isDestructive) {
    const approval = canonicalApprovalSchema.parse(trustedApproval);
    if (
      approval.approvalId !== request.approvalId ||
      approval.planHash !== request.planHash ||
      approval.changeUnit !== "APPROVED" ||
      approval.backupRef !== request.backupRef ||
      approval.rollbackRef !== request.rollbackRef
    )
      throw new Error("canonical approval mismatch");
  }
  return request;
}
export function parseDatabaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("invalid database URL");
  }
  if (parsed.protocol !== "postgresql:")
    throw new Error("invalid database credentials");
  if (!parsed.hostname) throw new Error("database host is required");
  return parsed;
}
export function validateE2ERequest(input: unknown): E2EPolicyRequest {
  const request = e2eRequestSchema.parse(input);
  const parsed = new URL(request.url);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("E2E URL protocol is forbidden");
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    !/^(localhost|127\.0\.0\.1|::1)$/i.test(host) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    /prod|staging|cloud/i.test(parsed.pathname)
  )
    throw new Error("E2E URL must be local");
  return request;
}
export function migrationCommands(): readonly (readonly string[])[] {
  return [
    ["pnpm", "db:generate"],
    ["pnpm", "db:migrate"],
  ];
}
export function e2eCommand(): readonly string[] {
  return ["./tools/run-e2e"];
}
