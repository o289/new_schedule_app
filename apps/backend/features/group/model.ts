import { relations, sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "../user/model";

export const groupMemberRoleEnum = pgEnum("group_member_role", [
  "owner",
  "member",
]);

export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  joinCodeDigest: varchar("join_code_digest", { length: 64 })
    .notNull()
    .unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: groupMemberRoleEnum("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    uniqueIndex("group_members_one_owner_unique")
      .on(table.groupId)
      .where(sql`${table.role} = 'owner'`),
    index("group_members_user_id_index").on(table.userId),
  ],
);

export const groupBannedMembers = pgTable(
  "group_banned_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bannedByUserId: uuid("banned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bannedAt: timestamp("banned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_banned_members_user_id_index").on(table.userId),
  ],
);

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  bannedMembers: many(groupBannedMembers),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
}));

export const groupBannedMembersRelations = relations(
  groupBannedMembers,
  ({ one }) => ({
    group: one(groups, {
      fields: [groupBannedMembers.groupId],
      references: [groups.id],
    }),
    user: one(users, {
      fields: [groupBannedMembers.userId],
      references: [users.id],
      relationName: "bannedUser",
    }),
    bannedByUser: one(users, {
      fields: [groupBannedMembers.bannedByUserId],
      references: [users.id],
      relationName: "bannedByUser",
    }),
  }),
);
