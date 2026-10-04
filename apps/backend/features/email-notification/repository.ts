import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";

import type {
  EmailNotificationSettings,
  EmailNotificationSettingsUpdate,
} from "#schemas/email-notification";
import { BaseRepository, type Transaction } from "#backend/database/repository";
import { authSessions } from "../auth-session/model";
import { categories } from "../category/model";
import { scheduleDates, schedules } from "../schedule/model";
import { users } from "../user/model";
import {
  emailDeliveryLogs,
  emailNotificationPreferences,
  emailNotificationWeekdayRules,
} from "./model";

const defaultDeliveryTime = "09:00";
const isoWeekdays = [1, 2, 3, 4, 5, 6, 7] as const;

export class EmailNotificationRepository extends BaseRepository {
  private async read(
    database: DatabaseLike,
    userId: string,
  ): Promise<EmailNotificationSettings> {
    const [preference] = await database
      .select()
      .from(emailNotificationPreferences)
      .where(eq(emailNotificationPreferences.userId, userId))
      .limit(1);
    const rules = await database
      .select({
        dayOfWeek: emailNotificationWeekdayRules.dayOfWeek,
        enabled: emailNotificationWeekdayRules.enabled,
        deliveryTime: emailNotificationWeekdayRules.deliveryTime,
      })
      .from(emailNotificationWeekdayRules)
      .where(eq(emailNotificationWeekdayRules.userId, userId));
    const rulesByDay = new Map(rules.map((rule) => [rule.dayOfWeek, rule]));

    return {
      globalEnabled: preference?.globalEnabled ?? false,
      timezone:
        preference?.timezone === "Asia/Tokyo"
          ? preference.timezone
          : "Asia/Tokyo",
      weekdays: isoWeekdays.map(
        (dayOfWeek) =>
          rulesByDay.get(dayOfWeek) ?? {
            dayOfWeek,
            enabled: false,
            deliveryTime: defaultDeliveryTime,
          },
      ),
    };
  }

  async getByUser(userId: string): Promise<EmailNotificationSettings> {
    return this.read(this.database, userId);
  }

  async replace(
    userId: string,
    input: EmailNotificationSettingsUpdate,
  ): Promise<EmailNotificationSettings> {
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      await transaction
        .insert(emailNotificationPreferences)
        .values({
          userId,
          globalEnabled: input.globalEnabled,
          timezone: input.timezone,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: emailNotificationPreferences.userId,
          set: {
            globalEnabled: input.globalEnabled,
            timezone: input.timezone,
            updatedAt: now,
          },
        });

      await transaction
        .delete(emailNotificationWeekdayRules)
        .where(eq(emailNotificationWeekdayRules.userId, userId));
      await transaction.insert(emailNotificationWeekdayRules).values(
        input.weekdays.map((rule) => ({
          userId,
          dayOfWeek: rule.dayOfWeek,
          enabled: rule.enabled,
          deliveryTime: rule.deliveryTime,
          createdAt: now,
          updatedAt: now,
        })),
      );

      return this.read(transaction, userId);
    });
  }

  async getDueCandidates(dayOfWeek: number): Promise<EmailDueCandidate[]> {
    return this.database
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        deliveryTime: emailNotificationWeekdayRules.deliveryTime,
      })
      .from(emailNotificationPreferences)
      .innerJoin(
        emailNotificationWeekdayRules,
        eq(
          emailNotificationPreferences.userId,
          emailNotificationWeekdayRules.userId,
        ),
      )
      .innerJoin(users, eq(users.id, emailNotificationPreferences.userId))
      .where(
        and(
          eq(emailNotificationPreferences.globalEnabled, true),
          eq(emailNotificationWeekdayRules.dayOfWeek, dayOfWeek),
          eq(emailNotificationWeekdayRules.enabled, true),
        ),
      );
  }

  async hasActiveSession(userId: string, now: Date): Promise<boolean> {
    const [session] = await this.database
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        ),
      )
      .limit(1);
    return session !== undefined;
  }

  async getEventsForDate(
    userId: string,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<DailyEmailEventRecord[]> {
    return this.database
      .select({
        title: schedules.title,
        categoryName: categories.name,
        startDate: scheduleDates.startDate,
        endDate: scheduleDates.endDate,
      })
      .from(schedules)
      .innerJoin(scheduleDates, eq(scheduleDates.scheduleId, schedules.id))
      .innerJoin(
        categories,
        and(
          eq(categories.id, schedules.categoryId),
          eq(categories.userId, schedules.userId),
        ),
      )
      .where(
        and(
          eq(schedules.userId, userId),
          lt(scheduleDates.startDate, rangeEnd),
          gt(scheduleDates.endDate, rangeStart),
        ),
      )
      .orderBy(scheduleDates.startDate);
  }

  async claim(
    userId: string,
    localDate: string,
    now: Date,
    maxAttempts: number,
  ): Promise<boolean> {
    const [created] = await this.database
      .insert(emailDeliveryLogs)
      .values({
        userId,
        localDate,
        status: "pending",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [emailDeliveryLogs.userId, emailDeliveryLogs.localDate],
      })
      .returning({ id: emailDeliveryLogs.id });
    if (created) return true;

    const [retry] = await this.database
      .update(emailDeliveryLogs)
      .set({
        status: "pending",
        attemptCount: sql`${emailDeliveryLogs.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailDeliveryLogs.userId, userId),
          eq(emailDeliveryLogs.localDate, localDate),
          eq(emailDeliveryLogs.status, "failed"),
          inArray(emailDeliveryLogs.lastError, ["temporary", "rate_limited"]),
          lt(emailDeliveryLogs.attemptCount, maxAttempts),
          lt(emailDeliveryLogs.updatedAt, new Date(now.getTime() - 5 * 60_000)),
        ),
      )
      .returning({ id: emailDeliveryLogs.id });
    return retry !== undefined;
  }

  async markSent(
    userId: string,
    localDate: string,
    providerMessageId: string | null,
    now: Date,
  ): Promise<void> {
    await this.database
      .update(emailDeliveryLogs)
      .set({ status: "sent", providerMessageId, updatedAt: now })
      .where(
        and(
          eq(emailDeliveryLogs.userId, userId),
          eq(emailDeliveryLogs.localDate, localDate),
          eq(emailDeliveryLogs.status, "pending"),
        ),
      );
  }

  async markFailed(
    userId: string,
    localDate: string,
    now: Date,
    errorKind: string,
  ): Promise<void> {
    await this.database
      .update(emailDeliveryLogs)
      .set({
        status: "failed",
        attemptCount: sql`${emailDeliveryLogs.attemptCount}`,
        lastError: errorKind,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailDeliveryLogs.userId, userId),
          eq(emailDeliveryLogs.localDate, localDate),
          eq(emailDeliveryLogs.status, "pending"),
        ),
      );
  }

  async releaseClaim(userId: string, localDate: string): Promise<void> {
    await this.database
      .delete(emailDeliveryLogs)
      .where(
        and(
          eq(emailDeliveryLogs.userId, userId),
          eq(emailDeliveryLogs.localDate, localDate),
          eq(emailDeliveryLogs.status, "pending"),
        ),
      );
  }
}

type DatabaseLike = Pick<Transaction, "select">;

export type EmailDueCandidate = {
  userId: string;
  email: string;
  name: string;
  deliveryTime: string;
};

export type DailyEmailEventRecord = {
  title: string;
  categoryName: string;
  startDate: string;
  endDate: string;
};
