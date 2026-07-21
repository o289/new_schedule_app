import { relations } from "drizzle-orm";
import { pgTable, pgEnum, uuid, varchar, unique } from "drizzle-orm/pg-core";
import { users } from "../user/model";
import { schedules } from "../schedule/model";

/**
 * カテゴリーカラー
 */
export const categoryColorEnum = pgEnum("category_color", [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "teal",
  "gray",
  "brown",
]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    name: varchar("name", {
      length: 50,
    }).notNull(),

    color: categoryColorEnum("color").notNull().default("gray"),
  },
  (table) => [
    unique("categories_id_user_id_unique").on(table.id, table.userId),
  ],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),

  schedules: many(schedules),
}));
