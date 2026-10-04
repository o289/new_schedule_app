import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("./service", () => ({
  EmailNotificationService: class {
    getSettings = mocks.getSettings;
    updateSettings = mocks.updateSettings;
  },
}));

vi.mock("#backend/core/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

import { app } from "#backend/app";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "notification@example.com",
  name: "通知ユーザー",
  avatar: null,
};

const settings = {
  globalEnabled: false,
  timezone: "Asia/Tokyo" as const,
  weekdays: Array.from({ length: 7 }, (_, index) => ({
    dayOfWeek: index + 1,
    enabled: false,
    deliveryTime: "09:00",
  })),
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

describe("email notification router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(user);
  });

  it("GET /email-notification/settings returns defaults", async () => {
    mocks.getSettings.mockResolvedValue(settings);

    const response = await request("/email-notification/settings");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(settings);
    expect(mocks.getSettings).toHaveBeenCalledWith(user);
  });

  it("PUT /email-notification/settings updates all weekdays", async () => {
    const input = {
      ...settings,
      globalEnabled: true,
      weekdays: settings.weekdays.map((rule) => ({
        ...rule,
        enabled: true,
        deliveryTime: "07:30",
      })),
    };
    mocks.updateSettings.mockResolvedValue(input);

    const response = await request("/email-notification/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(input);
    expect(mocks.updateSettings).toHaveBeenCalledWith(user, input);
  });

  it("PUT /email-notification/settings rejects duplicate weekdays", async () => {
    const invalid = {
      ...settings,
      weekdays: settings.weekdays.map((rule, index) =>
        index === 6 ? { ...rule, dayOfWeek: 1 } : rule,
      ),
    };

    const response = await request("/email-notification/settings", {
      method: "PUT",
      body: JSON.stringify(invalid),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "VALIDATION_ERROR",
    });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});
