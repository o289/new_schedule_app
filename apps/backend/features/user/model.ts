import { relations } from "drizzle-orm";
import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { passkeys } from "../passkey/model";
import { categories } from "../category/model";
import { schedules } from "../schedule/model";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  email: varchar("email", { length: 255 }).notNull().unique(),

  refreshToken: varchar("refresh_token", {
    length: 512,
  }),
});

export const usersRelations = relations(users, ({ many }) => ({
  passkeys: many(passkeys),
  categories: many(categories),
  schedules: many(schedules),
}));
