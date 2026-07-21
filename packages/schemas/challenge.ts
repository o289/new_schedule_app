import { z } from "zod";

/**
 * Repositoryへ渡すDB保存用スキーマ
 */
export const challengeCreateSchema = z.object({
  userId: z.uuid(),
  challenge: z.string(),
  type: z.enum(["register", "login"]),
  expiresAt: z.iso.datetime(),
});

/**
 * DBから取得したChallengeを返すレスポンス用スキーマ
 */
export const challengeResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  challenge: z.string(),
  type: z.enum(["register", "login"]),
  expiresAt: z.iso.datetime(),
});

export type ChallengeCreate = z.infer<typeof challengeCreateSchema>;
export type ChallengeResponse = z.infer<typeof challengeResponseSchema>;
