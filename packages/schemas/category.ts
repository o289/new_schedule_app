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
 * カテゴリーアイコン
 *
 * DBにはMUIのコンポーネント名ではなく、用途を表す安定したキーを保存する。
 */
export const categoryIconValues = [
  "tag",
  "car",
  "bicycle",
  "bus",
  "train",
  "flight",
  "work",
  "school",
  "study",
  "home",
  "family",
  "friends",
  "event",
  "meeting",
  "birthday",
  "health",
  "medical",
  "fitness",
  "sports",
  "food",
  "cafe",
  "shopping",
  "money",
  "bank",
  "music",
  "movie",
  "game",
  "book",
  "pet",
  "beauty",
  "phone",
  "computer",
  "outdoors",
  "travel",
  "other",
] as const;

export const categoryIconSchema = z.enum(categoryIconValues);

/**
 * 共通スキーマ
 */
export const categoryBaseSchema = z.object({
  name: z.string().min(1).max(50),
  color: categoryColorSchema.default("gray"),
  icon: categoryIconSchema.default("tag"),
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
export type CategoryIcon = z.infer<typeof categoryIconSchema>;

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;
