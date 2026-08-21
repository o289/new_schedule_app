import { and, eq, gt, lt, sql } from "drizzle-orm";

import { db } from "#backend/database/client";
import { BaseRepository, type Database } from "#backend/database/repository";
import type { AvatarKey } from "#schemas/user";
import { scheduleDates, schedules } from "../schedule/model";
import { users } from "../user/model";
import { groupMembers } from "./model";

export type GroupCalendarMember = {
  userId: string;
  name: string;
  avatar: AvatarKey | null;
  role: "owner" | "member";
  joinedAt: Date;
};

export type GroupCalendarEvent = {
  dateId: string;
  startDate: string;
  endDate: string;
  userId: string;
  name: string;
  avatar: AvatarKey | null;
};

export type GroupCalendarSnapshot = {
  members: GroupCalendarMember[];
  events: GroupCalendarEvent[];
};

export class GroupCalendarRepository extends BaseRepository {
  constructor(database: Database = db) {
    super(database);
  }

  async getCompleteCalendarSnapshot(
    groupId: string,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<GroupCalendarSnapshot> {
    return this.database.transaction(async (transaction) => {
      // 最初のSQLで分離レベルを設定し、memberとeventを同一snapshotから読む。
      await transaction.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`,
      );

      const members = await transaction
        .select({
          userId: users.id,
          name: users.name,
          avatar: users.avatar,
          role: groupMembers.role,
          joinedAt: groupMembers.joinedAt,
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, groupId));

      const events = await transaction
        .select({
          dateId: scheduleDates.id,
          startDate: scheduleDates.startDate,
          endDate: scheduleDates.endDate,
          userId: users.id,
          name: users.name,
          avatar: users.avatar,
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .innerJoin(schedules, eq(schedules.userId, users.id))
        .innerJoin(scheduleDates, eq(scheduleDates.scheduleId, schedules.id))
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            lt(scheduleDates.startDate, rangeEnd),
            gt(scheduleDates.endDate, rangeStart),
          ),
        );

      return {
        members: members as GroupCalendarMember[],
        events: events as GroupCalendarEvent[],
      };
    });
  }
}
