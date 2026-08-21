import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

import { users } from "../user/model";

export const challenges = pgTable("challenges", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  challenge: varchar("challenge", {
    length: 255,
  }).notNull(),

  type: varchar("type", {
    length: 20,
  }).notNull(),

  registrationName: varchar("registration_name", { length: 50 }),

  registrationAvatar: varchar("registration_avatar", { length: 20 }),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),
});
