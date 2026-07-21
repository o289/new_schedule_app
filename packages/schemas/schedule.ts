import { z } from "zod";

import { categoryBaseSchema } from "./category";

/* ---------------- ScheduleDate ---------------- */

// Schedule datetimes are Japanese wall-clock times and never include an offset.
const dateTimeSchema = z.iso.datetime({ local: true });

export const scheduleDateBaseSchema = z.object({
  startDate: dateTimeSchema,
  endDate: dateTimeSchema,
});

export const scheduleDateCreateSchema = scheduleDateBaseSchema;

export const scheduleDateUpdateSchema = z.object({
  id: z.uuid().optional(),
  startDate: dateTimeSchema.optional(),
  endDate: dateTimeSchema.optional(),
});

export const scheduleDateResponseSchema = scheduleDateBaseSchema.extend({
  id: z.uuid(),
});

/* ---------------- Schedule ---------------- */

export const scheduleBaseSchema = z.object({
  title: z.string().max(50).optional(),
  note: z.string().optional(),
  categoryId: z.uuid().optional(),
});

export const scheduleCreateSchema = scheduleBaseSchema.extend({
  title: z.string().min(1).max(50),

  categoryId: z.uuid(),

  dates: z.array(scheduleDateCreateSchema).min(1),
});

export const scheduleUpdateSchema = scheduleBaseSchema.extend({
  dates: z.array(scheduleDateUpdateSchema).min(1).optional(),
});

export const scheduleResponseSchema = scheduleBaseSchema.extend({
  id: z.uuid(),

  dates: z.array(scheduleDateResponseSchema),

  category: categoryBaseSchema,
});

export type ScheduleDateCreate = z.infer<typeof scheduleDateCreateSchema>;

export type ScheduleDateUpdate = z.infer<typeof scheduleDateUpdateSchema>;

export type ScheduleDateResponse = z.infer<typeof scheduleDateResponseSchema>;

export type ScheduleCreate = z.infer<typeof scheduleCreateSchema>;

export type ScheduleUpdate = z.infer<typeof scheduleUpdateSchema>;

export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;
