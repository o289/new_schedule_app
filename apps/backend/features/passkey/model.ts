import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "../user/model";

export const passkeys = pgTable("passkeys", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  credentialId: varchar("credential_id", {
    length: 255,
  })
    .notNull()
    .unique(),

  publicKey: text("public_key").notNull(),

  signCount: integer("sign_count").notNull().default(0),

  transports: varchar("transports", {
    length: 255,
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  lastUsedAt: timestamp("last_used_at", {
    withTimezone: true,
  }),
});

export const passkeysRelations = relations(passkeys, ({ one }) => ({
  user: one(users, {
    fields: [passkeys.userId],
    references: [users.id],
  }),
}));
