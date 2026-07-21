import { z } from "zod";

export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("有効なメールアドレスを入力してください");

export const userResponseSchema = z.object({
  email: userEmailSchema.nullish(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
