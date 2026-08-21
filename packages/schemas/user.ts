import { z } from "zod";

export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("有効なメールアドレスを入力してください");

export const userNameSchema = z
  .string()
  .trim()
  .min(1, "表示名を入力してください")
  .max(50, "表示名は50文字以内で入力してください");

export const avatarKeySchema = z.enum([
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "slate",
]);

export const userResponseSchema = z.object({
  email: userEmailSchema,
  name: userNameSchema,
  avatar: avatarKeySchema.nullable(),
});

export const publicUserProfileSchema = z
  .object({
    name: userNameSchema,
    avatar: avatarKeySchema.nullable(),
  })
  .strict();

export type UserResponse = z.infer<typeof userResponseSchema>;
export type AvatarKey = z.infer<typeof avatarKeySchema>;
export type PublicUserProfile = z.infer<typeof publicUserProfileSchema>;
