import type {
  ScheduleCreate,
  ScheduleDateUpdate,
  ScheduleUpdate,
} from "../../../../packages/schemas/schedule";
import { BadRequestError, NotFoundError } from "../../core/api-error";
import type { User } from "../user/repository";
import { CategoryRepository } from "../category/repository";
import { ScheduleRepository, type Schedule } from "./repository";

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

  async createSchedule(user: User, input: ScheduleCreate): Promise<Schedule> {
    this.validateDates(input.dates);
    await this.assertOwnedCategory(user.id, input.categoryId);
    return this.repository.create(input, user.id);
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

    const updated = await this.repository.update(schedule.id, input);
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
