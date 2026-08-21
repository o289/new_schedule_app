import { describe, expect, it } from "vitest";

import type { GroupCalendarResponse } from "#schemas/group";
import {
  canUseSnapshotForAvailability,
  deriveGroupCalendarDisplayState,
} from "./groupCalendarState";

const snapshot: GroupCalendarResponse = {
  groupId: "11111111-1111-4111-8111-111111111111",
  requestedMemberCount: 1,
  fetchedMemberCount: 1,
  completeness: "complete",
  members: [
    {
      userId: "22222222-2222-4222-8222-222222222222",
      name: "メンバー",
      avatar: null,
      role: "owner",
      joinedAt: "2026-08-01T00:00:00Z",
    },
  ],
  events: [],
};

describe("group calendar state", () => {
  it.each([
    [{ isPending: true, isFetching: true, isError: false }, "loading"],
    [{ isPending: false, isFetching: false, isError: true }, "error"],
    [
      { data: snapshot, isPending: false, isFetching: true, isError: false },
      "refreshing",
    ],
    [
      { data: snapshot, isPending: false, isFetching: false, isError: true },
      "stale",
    ],
    [
      { data: snapshot, isPending: false, isFetching: false, isError: false },
      "success",
    ],
  ] as const)("状態を%sから%sへ分類する", (query, expected) => {
    expect(deriveGroupCalendarDisplayState(query)).toBe(expected);
  });

  it("stale dataを空き候補の根拠にしない", () => {
    expect(canUseSnapshotForAvailability("success", snapshot)).toBe(true);
    expect(canUseSnapshotForAvailability("stale", snapshot)).toBe(false);
  });
});
