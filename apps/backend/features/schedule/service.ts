import type {
  ScheduleCreate,
  ScheduleDateCreate,
  ScheduleDateUpdate,
  ScheduleUpdate,
} from "../../../../packages/schemas/schedule";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../core/api-error";
import type { User } from "../user/repository";
import { CategoryRepository } from "../category/repository";
import {
  ScheduleRepository,
  type Schedule,
  type ScheduleDate,
} from "./repository";

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && error.code === code) {
    return true;
  }

  return (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    error.cause.code === code
  );
}

export class ScheduleService {
  private readonly repository: ScheduleRepository;
  private readonly categoryRepository: CategoryRepository;

  constructor(
    repository = new ScheduleRepository(),
    categoryRepository = new CategoryRepository(),
  ) {
    this.repository = repository;
    this.categoryRepository = categoryRepository;
  }

  private validateDates(dates: ScheduleDateUpdate[]): void {
    for (const date of dates) {
      if (
        date.id === undefined &&
        (date.startDate === undefined || date.endDate === undefined)
      ) {
        throw new BadRequestError("INVALID_TIME");
      }

      if (
        date.startDate !== undefined &&
        date.endDate !== undefined &&
        date.endDate <= date.startDate
      ) {
        throw new BadRequestError("INVALID_TIME");
      }
    }
  }

  private normalizeDateTime(value: string): string {
    return value.replace(" ", "T");
  }

  private resolveUpdateDates(
    existingDates: ScheduleDate[],
    inputDates: ScheduleDateUpdate[],
  ): ScheduleDateCreate[] {
    const existingById = new Map(existingDates.map((date) => [date.id, date]));

    return inputDates.map((date) => {
      const existing = date.id ? existingById.get(date.id) : undefined;
      const startDate = date.startDate ?? existing?.startDate;
      const endDate = date.endDate ?? existing?.endDate;

      if (startDate === undefined || endDate === undefined) {
        throw new BadRequestError("INVALID_TIME");
      }

      return {
        startDate: this.normalizeDateTime(startDate),
        endDate: this.normalizeDateTime(endDate),
      };
    });
  }

  private async assertDatesDoNotOverlap(
    userId: string,
    dates: ScheduleDateCreate[],
    excludedScheduleId?: string,
  ): Promise<void> {
    for (let index = 0; index < dates.length; index += 1) {
      const candidate = dates[index]!;

      for (const other of dates.slice(index + 1)) {
        if (
          candidate.startDate < other.endDate &&
          candidate.endDate > other.startDate
        ) {
          throw new ConflictError("SCHEDULE_TIME_OVERLAP");
        }
      }

      if (
        await this.repository.hasOverlappingDate(
          userId,
          candidate.startDate,
          candidate.endDate,
          excludedScheduleId,
        )
      ) {
        throw new ConflictError("SCHEDULE_TIME_OVERLAP");
      }
    }
  }

  private rethrowScheduleTimeOverlap(error: unknown): never {
    if (hasPostgresErrorCode(error, "23P01")) {
      throw new ConflictError("SCHEDULE_TIME_OVERLAP");
    }

    throw error;
  }

  async createSchedule(user: User, input: ScheduleCreate): Promise<Schedule> {
    this.validateDates(input.dates);
    await this.assertOwnedCategory(user.id, input.categoryId);
    await this.assertDatesDoNotOverlap(user.id, input.dates);

    try {
      return await this.repository.create(input, user.id);
    } catch (error) {
      return this.rethrowScheduleTimeOverlap(error);
    }
  }

  async listSchedules(user: User): Promise<Schedule[]> {
    return this.repository.getByUser(user.id);
  }

  async getSchedule(user: User, scheduleId: string): Promise<Schedule> {
    const schedule = await this.repository.get(scheduleId);
    if (!schedule || schedule.userId !== user.id) {
      throw new NotFoundError("NOT_FOUND_SCHEDULE");
    }
    return schedule;
  }

  async updateSchedule(
    user: User,
    scheduleId: string,
    input: ScheduleUpdate,
  ): Promise<Schedule> {
    const schedule = await this.getSchedule(user, scheduleId);
    if (input.dates !== undefined) {
      this.validateDates(input.dates);
    }
    if (input.categoryId !== undefined) {
      await this.assertOwnedCategory(user.id, input.categoryId);
    }

    if (input.dates !== undefined) {
      const resolvedDates = this.resolveUpdateDates(
        schedule.dates,
        input.dates,
      );
      this.validateDates(resolvedDates);
      await this.assertDatesDoNotOverlap(user.id, resolvedDates, schedule.id);
    }

    let updated: Schedule | null;
    try {
      updated = await this.repository.update(schedule.id, input);
    } catch (error) {
      return this.rethrowScheduleTimeOverlap(error);
    }
    if (!updated) {
      throw new NotFoundError("NOT_FOUND_SCHEDULE");
    }
    return updated;
  }

  async deleteSchedule(user: User, scheduleId: string): Promise<void> {
    const deleted = await this.repository.delete(scheduleId, user.id);
    if (!deleted) {
      throw new NotFoundError("NOT_FOUND_SCHEDULE");
    }
  }

  private async assertOwnedCategory(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categoryRepository.get(categoryId);
    if (!category || category.userId !== userId) {
      throw new NotFoundError("NOT_FOUND_CATEGORY");
    }
  }
}
