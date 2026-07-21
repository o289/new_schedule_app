import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError, NotFoundError } from "../../core/api-error";

const mocks = vi.hoisted(() => ({
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
  getSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  requireCurrentUser: vi.fn(),
  verifyAccessToken: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("./service", () => ({
  ScheduleService: class {
    createSchedule = mocks.createSchedule;
    listSchedules = mocks.listSchedules;
    getSchedule = mocks.getSchedule;
    updateSchedule = mocks.updateSchedule;
    deleteSchedule = mocks.deleteSchedule;
  },
}));

vi.mock("../auth/service", () => ({ AuthService: class {} }));
vi.mock("../user/repository", () => ({
  UserRepository: class {
    getById = mocks.getById;
  },
}));
vi.mock("../../core/security", () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));
vi.mock("../../core/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

import { app } from "../../app";

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
const schedule = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: user.id,
  title: "meeting",
  note: null,
  categoryId: category.id,
  category,
  dates: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      scheduleId: "33333333-3333-4333-8333-333333333333",
      startDate: "2025-01-01 10:00:00",
      endDate: "2025-01-01 11:00:00",
    },
  ],
};

function request(path: string, options: RequestInit = {}) {
  return app.request(path, {
    ...options,
    headers: {
      Authorization: "Bearer access-token",
      "content-type": "application/json",
      ...options.headers,
    },
  });
}

describe("schedule router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(user);
  });

  it("POST /schedules はスケジュールを作成し201を返す", async () => {
    mocks.createSchedule.mockResolvedValue(schedule);
    const body = {
      title: "meeting",
      categoryId: category.id,
      dates: [
        {
          startDate: "2025-01-01T10:00:00",
          endDate: "2025-01-01T11:00:00",
        },
      ],
    };

    const response = await request("/schedules", {
      method: "POST",
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(201);
    expect(mocks.createSchedule).toHaveBeenCalledWith(user, body);
    await expect(response.json()).resolves.toMatchObject({
      id: schedule.id,
      dates: [
        {
          id: schedule.dates[0]!.id,
          startDate: "2025-01-01T10:00:00",
          endDate: "2025-01-01T11:00:00",
        },
      ],
    });
  });

  it("POST /schedules は逆転した時刻をサービスで400にする", async () => {
    mocks.createSchedule.mockRejectedValue(new BadRequestError("INVALID_TIME"));
    const response = await request("/schedules", {
      method: "POST",
      body: JSON.stringify({
        title: "meeting",
        categoryId: category.id,
        dates: [
          {
            startDate: "2025-01-01T12:00:00",
            endDate: "2025-01-01T11:00:00",
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_TIME" });
  });

  it("PUT /schedules/:id は存在しないスケジュールを404にする", async () => {
    mocks.updateSchedule.mockRejectedValue(
      new NotFoundError("NOT_FOUND_SCHEDULE"),
    );
    const response = await request(`/schedules/${schedule.id}`, {
      method: "PUT",
      body: JSON.stringify({ title: "updated" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "NOT_FOUND_SCHEDULE",
    });
  });

  it("DELETE /schedules/:id は204を返す", async () => {
    mocks.deleteSchedule.mockResolvedValue(undefined);
    const response = await request(`/schedules/${schedule.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });
});
