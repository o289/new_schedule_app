import { describe, expect, it, vi } from "vitest";

import { ApiClientError } from "#frontend/lib/apiError";

const groupApiMock = vi.hoisted(() => ({ calendar: vi.fn() }));

vi.mock("#frontend/lib/api", () => ({
  groupApi: groupApiMock,
}));

import {
  fetchGroupCalendar,
  shouldRetryGroupCalendar,
} from "./useGroupCalendar";

describe("useGroupCalendar", () => {
  it("QueryのAbortSignalをグループカレンダーAPIへ渡す", async () => {
    const range = {
      startDate: "2026-08-21T00:00:00",
      endDate: "2026-08-28T00:00:00",
    };
    const controller = new AbortController();
    groupApiMock.calendar.mockResolvedValueOnce({ events: [] });

    await fetchGroupCalendar(
      "11111111-1111-4111-8111-111111111111",
      range,
      controller.signal,
    );

    expect(groupApiMock.calendar).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      range,
      controller.signal,
    );
  });

  it("networkと502/503/504だけを最大3回retryする", () => {
    expect(shouldRetryGroupCalendar(0, new TypeError("network"))).toBe(true);
    expect(
      shouldRetryGroupCalendar(2, new ApiClientError("SERVER_ERROR", 503)),
    ).toBe(true);
    expect(
      shouldRetryGroupCalendar(0, new ApiClientError("NOT_FOUND_GROUP", 404)),
    ).toBe(false);
    expect(
      shouldRetryGroupCalendar(3, new ApiClientError("SERVER_ERROR", 503)),
    ).toBe(false);
  });
});
