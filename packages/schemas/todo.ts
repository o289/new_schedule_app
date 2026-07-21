import { z } from "zod";

/**
 * TODO優先度
 */
export const todoPrioritySchema = z.enum([
  "very_low",
  "low",
  "medium",
  "high",
  "very_high",
]);

/**
 * 共通スキーマ
 */
export const todoBaseSchema = z.object({
  title: z.string().min(1).max(200),

  isDone: z.boolean().default(false),

  priority: todoPrioritySchema.default("medium"),

  dueDate: z.iso.date().optional(),
});

/**
 * 作成用
 */
export const todoCreateSchema = todoBaseSchema;

/**
 * 更新用
 */
export const todoUpdateSchema = todoBaseSchema.partial();

/**
 * レスポンス用
 */
export const todoResponseSchema = todoBaseSchema.extend({
  id: z.uuid(),

  doneAt: z.iso.datetime().optional(),
});

export type TodoPriority = z.infer<typeof todoPrioritySchema>;

export type TodoCreate = z.infer<typeof todoCreateSchema>;
export type TodoUpdate = z.infer<typeof todoUpdateSchema>;
export type TodoResponse = z.infer<typeof todoResponseSchema>;
