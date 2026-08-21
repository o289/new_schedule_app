import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticated: vi.fn() }));

vi.mock("./apiClient", () => ({
  apiClient: { authenticated: mocks.authenticated },
}));

import { groupApi } from "./api";

describe("groupApi", () => {
  it("グループ管理APIのmethod・path・signalを契約どおりに送る", () => {
    const controller = new AbortController();

    groupApi.list(controller.signal);
    groupApi.create({ name: "グループ" });
    groupApi.detail("group-id", controller.signal);
    groupApi.join({ joinCode: "JOINCODE" });
    groupApi.remove("group-id");
    groupApi.kick("group-id", "user-id");
    groupApi.leave("group-id");
    groupApi.calendar(
      "group-id",
      { startDate: "2026-08-21T00:00:00", endDate: "2026-08-22T00:00:00" },
      controller.signal,
    );

    expect(mocks.authenticated.mock.calls).toEqual([
      ["/groups", { method: "GET", signal: controller.signal }],
      [
        "/groups",
        { method: "POST", body: JSON.stringify({ name: "グループ" }) },
      ],
      ["/groups/group-id", { method: "GET", signal: controller.signal }],
      [
        "/groups/join",
        { method: "POST", body: JSON.stringify({ joinCode: "JOINCODE" }) },
      ],
      ["/groups/group-id", { method: "DELETE" }],
      ["/groups/group-id/members/user-id", { method: "DELETE" }],
      ["/groups/group-id/leave", { method: "POST" }],
      [
        "/groups/group-id/calendar?startDate=2026-08-21T00%3A00%3A00&endDate=2026-08-22T00%3A00%3A00",
        { method: "GET", signal: controller.signal },
      ],
    ]);
  });
});
