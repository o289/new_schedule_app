import { describe, expect, it, vi } from "vitest";

import { ScheduleService } from "./service";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "schedule@example.com",
  refreshToken: null,
};
const category = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: user.id,
  name: "仕事",
  color: "red" as const,
};

function createService(options?: {
  hasOverlappingDate?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}) {
  const repository = {
    hasOverlappingDate:
      options?.hasOverlappingDate ?? vi.fn().mockResolvedValue(false),
    create: options?.create ?? vi.fn(),
    get: options?.get ?? vi.fn(),
    update: options?.update ?? vi.fn(),
  };
  const categoryRepository = {
    get: vi.fn().mockResolvedValue(category),
  };

  return {
    service: new ScheduleService(
      repository as never,
      categoryRepository as never,
    ),
    repository,
  };
}

describe("ScheduleService", () => {
  it("ほかの予定と重なる日時は作成しない", async () => {
    const hasOverlappingDate = vi.fn().mockResolvedValue(true);
    const { service, repository } = createService({ hasOverlappingDate });

    await expect(
      service.createSchedule(user, {
        title: "A",
        categoryId: category.id,
        dates: [
          {
            startDate: "2026-03-12T15:00:00",
            endDate: "2026-03-12T16:00:00",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "SCHEDULE_TIME_OVERLAP",
      status: 409,
    });

    expect(hasOverlappingDate).toHaveBeenCalledWith(
      user.id,
      "2026-03-12T15:00:00",
      "2026-03-12T16:00:00",
      undefined,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("同じ登録内容内で重なる日時は作成しない", async () => {
    const { service, repository } = createService();

    await expect(
      service.createSchedule(user, {
        title: "A",
        categoryId: category.id,
        dates: [
          {
            startDate: "2026-03-12T14:00:00",
            endDate: "2026-03-12T17:00:00",
          },
          {
            startDate: "2026-03-12T15:00:00",
            endDate: "2026-03-12T16:00:00",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "SCHEDULE_TIME_OVERLAP",
    });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("終了時刻と次の開始時刻が同じ予定は作成できる", async () => {
    const create = vi.fn().mockResolvedValue({ id: "schedule-id" });
    const { service, repository } = createService({ create });
    const input = {
      title: "A",
      categoryId: category.id,
      dates: [
        {
          startDate: "2026-03-12T14:00:00",
          endDate: "2026-03-12T15:00:00",
        },
        {
          startDate: "2026-03-12T15:00:00",
          endDate: "2026-03-12T16:00:00",
        },
      ],
    };

    await expect(service.createSchedule(user, input)).resolves.toEqual({
      id: "schedule-id",
    });
    expect(repository.create).toHaveBeenCalledWith(input, user.id);
  });

  it("更新時は自分自身を除外して他の予定との重なりを確認する", async () => {
    const hasOverlappingDate = vi.fn().mockResolvedValue(true);
    const schedule = {
      id: "33333333-3333-4333-8333-333333333333",
      userId: user.id,
      dates: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          startDate: "2026-03-12 10:00:00",
          endDate: "2026-03-12 11:00:00",
        },
      ],
    };
    const get = vi.fn().mockResolvedValue(schedule);
    const { service, repository } = createService({
      hasOverlappingDate,
      get,
    });

    await expect(
      service.updateSchedule(user, schedule.id, {
        dates: [
          {
            id: schedule.dates[0]!.id,
            startDate: "2026-03-12T14:00:00",
            endDate: "2026-03-12T17:00:00",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "SCHEDULE_TIME_OVERLAP",
    });

    expect(hasOverlappingDate).toHaveBeenCalledWith(
      user.id,
      "2026-03-12T14:00:00",
      "2026-03-12T17:00:00",
      schedule.id,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("DBの同時更新による重なりエラーも409にする", async () => {
    const create = vi.fn().mockRejectedValue({ cause: { code: "23P01" } });
    const { service } = createService({ create });

    await expect(
      service.createSchedule(user, {
        title: "A",
        categoryId: category.id,
        dates: [
          {
            startDate: "2026-03-12T15:00:00",
            endDate: "2026-03-12T16:00:00",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "SCHEDULE_TIME_OVERLAP",
      status: 409,
    });
  });
});
