import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";

import { users } from "../user/model";
import { categories } from "../category/model";
import { todos } from "../todo/model";

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    title: varchar("title", {
      length: 50,
    }).notNull(),

    note: text("note"),

    categoryId: uuid("category_id").notNull(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
      name: "schedules_category_user_fk",
    }),
  ],
);

export const scheduleDates = pgTable(
  "schedule_dates",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, {
        onDelete: "cascade",
      }),

    startDate: timestamp("start_date", {
      withTimezone: false,
      mode: "string",
    }).notNull(),

    endDate: timestamp("end_date", {
      withTimezone: false,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    check("chk_end_after_start", sql`${table.endDate} >= ${table.startDate}`),
  ],
);

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  user: one(users, {
    fields: [schedules.userId],
    references: [users.id],
  }),

  category: one(categories, {
    fields: [schedules.categoryId],
    references: [categories.id],
  }),

  dates: many(scheduleDates),

  todos: many(todos),
}));

export const scheduleDatesRelations = relations(scheduleDates, ({ one }) => ({
  schedule: one(schedules, {
    fields: [scheduleDates.scheduleId],
    references: [schedules.id],
  }),
}));
