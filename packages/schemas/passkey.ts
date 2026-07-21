import { z } from "zod";

/**
 * Repositoryへ渡すDB保存用スキーマ
 */
export const passkeyCreateSchema = z.object({
  userId: z.uuid(),
  credentialId: z.string(),
  publicKey: z.string(),
  signCount: z.int().nonnegative(),
  transports: z.string().nullable().optional(),
});

/**
 * DBから取得したPasskeyを返すレスポンス用スキーマ
 */
export const passkeyResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  credentialId: z.string(),
  publicKey: z.string(),
  signCount: z.int().nonnegative(),
  transports: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable().optional(),
});

export type PasskeyCreate = z.infer<typeof passkeyCreateSchema>;
export type PasskeyResponse = z.infer<typeof passkeyResponseSchema>;
