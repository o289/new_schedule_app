import { and, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";

import type {
  ScheduleCreate,
  ScheduleDateUpdate,
  ScheduleUpdate,
} from "#schemas/schedule";
import { BaseRepository } from "#backend/database/repository";
import { categories } from "../category/model";
import { scheduleDates, schedules } from "./model";

export type ScheduleDate = typeof scheduleDates.$inferSelect;
export type Schedule = typeof schedules.$inferSelect & {
  category: typeof categories.$inferSelect;
  dates: ScheduleDate[];
};

export class ScheduleTimeOverlapError extends Error {
  constructor() {
    super("SCHEDULE_TIME_OVERLAP");
    this.name = "ScheduleTimeOverlapError";
  }
}

export class ScheduleRepository extends BaseRepository {
  private async hydrate(scheduleId: string): Promise<Schedule | null> {
    const schedule = await this.database.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
      with: { category: true, dates: true },
    });

    return (schedule as Schedule | undefined) ?? null;
  }

  async create(input: ScheduleCreate, userId: string): Promise<Schedule> {
    return this.database.transaction(async (transaction) => {
      await this.lockUserSchedules(transaction, userId);

      const overlaps = await transaction
        .select({
          dateId: scheduleDates.id,
          scheduleId: schedules.id,
          allowOverwrite: schedules.allowOverwrite,
        })
        .from(scheduleDates)
        .innerJoin(schedules, eq(scheduleDates.scheduleId, schedules.id))
        .where(
          and(
            eq(schedules.userId, userId),
            or(
              ...input.dates.map((date) =>
                and(
                  lt(scheduleDates.startDate, date.endDate),
                  gt(scheduleDates.endDate, date.startDate),
                ),
              ),
            ),
          ),
        );

      if (overlaps.some((overlap) => !overlap.allowOverwrite)) {
        throw new ScheduleTimeOverlapError();
      }

      if (overlaps.length > 0) {
        await transaction.delete(scheduleDates).where(
          inArray(
            scheduleDates.id,
            overlaps.map((overlap) => overlap.dateId),
          ),
        );

        const emptiedScheduleIds = [
          ...new Set(overlaps.map((overlap) => overlap.scheduleId)),
        ];
        const remainingDates = await transaction
          .select({ scheduleId: scheduleDates.scheduleId })
          .from(scheduleDates)
          .where(inArray(scheduleDates.scheduleId, emptiedScheduleIds));
        const schedulesWithDates = new Set(
          remainingDates.map((date) => date.scheduleId),
        );
        const emptyScheduleIds = emptiedScheduleIds.filter(
          (scheduleId) => !schedulesWithDates.has(scheduleId),
        );

        if (emptyScheduleIds.length > 0) {
          await transaction
            .delete(schedules)
            .where(inArray(schedules.id, emptyScheduleIds));
        }
      }

      const [schedule] = await transaction
        .insert(schedules)
        .values({
          title: input.title,
          note: input.note,
          url: input.url,
          categoryId: input.categoryId,
          isTentative: input.isTentative,
          allowOverwrite: input.allowOverwrite,
          userId,
        })
        .returning({ id: schedules.id });

      if (!schedule) {
        throw new Error("Failed to create schedule");
      }

      await transaction.insert(scheduleDates).values(
        input.dates.map((date) => ({
          scheduleId: schedule.id,
          startDate: date.startDate,
          endDate: date.endDate,
        })),
      );

      const created = await transaction.query.schedules.findFirst({
        where: eq(schedules.id, schedule.id),
        with: { category: true, dates: true },
      });
      if (!created) {
        throw new Error("Failed to load created schedule");
      }

      return created as Schedule;
    });
  }

  async get(scheduleId: string): Promise<Schedule | null> {
    return this.hydrate(scheduleId);
  }

  async getByUser(userId: string): Promise<Schedule[]> {
    const result = await this.database.query.schedules.findMany({
      where: eq(schedules.userId, userId),
      with: { category: true, dates: true },
    });

    return result as Schedule[];
  }

  async hasOverlappingDate(
    userId: string,
    startDate: string,
    endDate: string,
    excludedScheduleId?: string,
  ): Promise<boolean> {
    const [overlap] = await this.database
      .select({ id: scheduleDates.id })
      .from(scheduleDates)
      .innerJoin(schedules, eq(scheduleDates.scheduleId, schedules.id))
      .where(
        and(
          eq(schedules.userId, userId),
          lt(scheduleDates.startDate, endDate),
          gt(scheduleDates.endDate, startDate),
          excludedScheduleId === undefined
            ? undefined
            : ne(schedules.id, excludedScheduleId),
        ),
      )
      .limit(1);

    return overlap !== undefined;
  }

  async update(
    scheduleId: string,
    input: ScheduleUpdate,
    userId: string,
  ): Promise<Schedule | null> {
    return this.database.transaction(async (transaction) => {
      await this.lockUserSchedules(transaction, userId);

      const current = await transaction.query.schedules.findFirst({
        where: and(eq(schedules.id, scheduleId), eq(schedules.userId, userId)),
        with: { category: true, dates: true },
      });
      if (!current) {
        return null;
      }
      const { dates, ...fields } = input;
      if (Object.keys(fields).length > 0) {
        await transaction
          .update(schedules)
          .set(fields)
          .where(eq(schedules.id, scheduleId));
      }

      if (dates !== undefined) {
        await this.replaceDates(transaction, current.dates, scheduleId, dates);
      }

      const updated = await transaction.query.schedules.findFirst({
        where: eq(schedules.id, scheduleId),
        with: { category: true, dates: true },
      });
      return (updated as Schedule | undefined) ?? null;
    });
  }

  private async replaceDates(
    transaction: Parameters<Parameters<typeof this.database.transaction>[0]>[0],
    existingDates: ScheduleDate[],
    scheduleId: string,
    inputDates: ScheduleDateUpdate[],
  ): Promise<void> {
    const existingById = new Map(existingDates.map((date) => [date.id, date]));
    const incomingIds = new Set(
      inputDates.flatMap((date) => (date.id ? [date.id] : [])),
    );

    for (const date of inputDates) {
      if (date.id && existingById.has(date.id)) {
        const { id: _id, ...changes } = date;
        if (Object.keys(changes).length > 0) {
          await transaction
            .update(scheduleDates)
            .set({
              ...(changes.startDate && { startDate: changes.startDate }),
              ...(changes.endDate && { endDate: changes.endDate }),
            })
            .where(eq(scheduleDates.id, date.id));
        }
      } else {
        await transaction.insert(scheduleDates).values({
          scheduleId,
          startDate: date.startDate!,
          endDate: date.endDate!,
        });
      }
    }

    const removedIds = existingDates
      .filter((date) => !incomingIds.has(date.id))
      .map((date) => date.id);
    if (removedIds.length > 0) {
      await transaction
        .delete(scheduleDates)
        .where(
          and(
            eq(scheduleDates.scheduleId, scheduleId),
            inArray(scheduleDates.id, removedIds),
          ),
        );
    }
  }

  async delete(scheduleId: string, userId: string): Promise<boolean> {
    const deleted = await this.database.transaction(async (transaction) => {
      await this.lockUserSchedules(transaction, userId);
      return transaction
        .delete(schedules)
        .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, userId)))
        .returning({ id: schedules.id });
    });

    return deleted.length > 0;
  }

  private async lockUserSchedules(
    transaction: Parameters<Parameters<typeof this.database.transaction>[0]>[0],
    userId: string,
  ): Promise<void> {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`,
    );
  }
}
