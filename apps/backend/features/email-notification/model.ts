import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "../user/model";

export const emailNotificationPreferences = pgTable(
  "email_notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    globalEnabled: boolean("global_enabled").notNull().default(false),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("Asia/Tokyo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "chk_email_notification_timezone",
      sql`${table.timezone} = 'Asia/Tokyo'`,
    ),
  ],
);

export const emailNotificationWeekdayRules = pgTable(
  "email_notification_weekday_rules",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    deliveryTime: varchar("delivery_time", { length: 5 })
      .notNull()
      .default("09:00"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.dayOfWeek] }),
    index("email_notification_weekday_rules_user_id_index").on(table.userId),
    check(
      "chk_email_notification_day_of_week",
      sql`${table.dayOfWeek} between 1 and 7`,
    ),
    check(
      "chk_email_notification_delivery_time",
      sql`${table.deliveryTime} ~ '^(0[0-9]|1[0-9]|2[0-3]):[03]0$'`,
    ),
  ],
);

export const emailDeliveryLogs = pgTable(
  "email_delivery_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: varchar("local_date", { length: 10 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    lastError: varchar("last_error", { length: 2000 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("email_delivery_logs_user_local_date_unique").on(
      table.userId,
      table.localDate,
    ),
    index("email_delivery_logs_user_id_index").on(table.userId),
    check(
      "chk_email_delivery_logs_local_date",
      sql`${table.localDate} ~ '^\\d{4}-\\d{2}-\\d{2}$'`,
    ),
    check(
      "chk_email_delivery_logs_status",
      sql`${table.status} in ('pending', 'sent', 'failed')`,
    ),
  ],
);

export const emailNotificationPreferencesRelations = relations(
  emailNotificationPreferences,
  ({ one, many }) => ({
    user: one(users, {
      fields: [emailNotificationPreferences.userId],
      references: [users.id],
    }),
    weekdayRules: many(emailNotificationWeekdayRules),
  }),
);

export const emailNotificationWeekdayRulesRelations = relations(
  emailNotificationWeekdayRules,
  ({ one }) => ({
    user: one(users, {
      fields: [emailNotificationWeekdayRules.userId],
      references: [users.id],
    }),
  }),
);

export const emailDeliveryLogsRelations = relations(
  emailDeliveryLogs,
  ({ one }) => ({
    user: one(users, {
      fields: [emailDeliveryLogs.userId],
      references: [users.id],
    }),
  }),
);
