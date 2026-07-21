import { relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  date,
  timestamp,
} from "drizzle-orm/pg-core";

import { schedules } from "../schedule/model";

/**
 * TODO優先度
 */
export const todoPriorityEnum = pgEnum("todo_priority", [
  "very_low",
  "low",
  "medium",
  "high",
  "very_high",
]);

export const todos = pgTable("todos", {
  id: uuid("id").defaultRandom().primaryKey(),

  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => schedules.id, {
      onDelete: "cascade",
    }),

  title: varchar("title", {
    length: 200,
  }).notNull(),

  isDone: boolean("is_done").notNull().default(false),

  doneAt: timestamp("done_at", {
    withTimezone: true,
  }),

  priority: todoPriorityEnum("priority").notNull().default("medium"),

  dueDate: date("due_date"),
});

// todo/model.ts
export const todosRelations = relations(todos, ({ one }) => ({
  schedule: one(schedules, {
    fields: [todos.scheduleId],
    references: [schedules.id],
  }),
}));
