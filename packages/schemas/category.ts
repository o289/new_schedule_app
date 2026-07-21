import { z } from "zod";

/**
 * カテゴリーカラー
 */
export const categoryColorSchema = z.enum([
  "gray",
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "teal",
  "brown",
]);

/**
 * 共通スキーマ
 */
export const categoryBaseSchema = z.object({
  name: z.string().min(1).max(50),
  color: categoryColorSchema.default("gray"),
});

/**
 * 作成用
 */
export const categoryCreateSchema = categoryBaseSchema;

/**
 * 更新用
 */
export const categoryUpdateSchema = categoryBaseSchema.partial();

/**
 * レスポンス用
 */
export const categoryResponseSchema = categoryBaseSchema.extend({
  id: z.uuid(),
  userId: z.uuid(),
});

export type CategoryColor = z.infer<typeof categoryColorSchema>;

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;
