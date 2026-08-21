import { describe, expect, it } from "vitest";

import type { GroupBusyEvent, GroupCalendarResponse } from "#schemas/group";
import {
  aggregateGroupBusyEvents,
  findAvailableHalfHourSlots,
  splitGroupBusyEvent,
} from "./groupCalendarSegments";

const memberA = {
  userId: "11111111-1111-4111-8111-111111111111",
  name: "A",
  avatar: null,
};
const memberB = {
  userId: "22222222-2222-4222-8222-222222222222",
  name: "B",
  avatar: "sky" as const,
};

function event(
  dateId: string,
  member: typeof memberA | typeof memberB,
  startDate: string,
  endDate: string,
): GroupBusyEvent {
  return { dateId, member, startDate, endDate };
}

describe("group calendar segments", () => {
  it("1人・複数人・重複予定を日ごとの外接区間へ集約する", () => {
    const daily = aggregateGroupBusyEvents([
      event(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        memberA,
        "2026-08-21T09:00:00",
        "2026-08-21T10:00:00",
      ),
      event(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        memberB,
        "2026-08-21T09:30:00",
        "2026-08-21T11:00:00",
      ),
      event(
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        memberA,
        "2026-08-21T12:00:00",
        "2026-08-21T13:00:00",
      ),
    ]);

    expect(daily).toMatchObject([
      {
        day: "2026-08-21",
        startDate: "2026-08-21T09:00:00",
        endDate: "2026-08-21T13:00:00",
        memberCount: 2,
        memberIds: [memberA.userId, memberB.userId],
      },
    ]);
    expect(daily[0]?.events).toHaveLength(3);
  });

  it("日跨ぎ予定を日境界で分割し、終了端は翌日に含めない", () => {
    const crossing = event(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      memberA,
      "2026-08-21T23:00:00",
      "2026-08-22T01:00:00",
    );
    const endingAtBoundary = event(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      memberB,
      "2026-08-21T22:00:00",
      "2026-08-22T00:00:00",
    );

    expect(splitGroupBusyEvent(crossing)).toMatchObject([
      {
        day: "2026-08-21",
        startDate: "2026-08-21T23:00:00",
        endDate: "2026-08-22T00:00:00",
      },
      {
        day: "2026-08-22",
        startDate: "2026-08-22T00:00:00",
        endDate: "2026-08-22T01:00:00",
      },
    ]);
    expect(splitGroupBusyEvent(endingAtBoundary)).toHaveLength(1);
  });

  it("complete snapshotだけから30分単位の空き候補を作る", () => {
    const snapshot: GroupCalendarResponse = {
      groupId: "33333333-3333-4333-8333-333333333333",
      requestedMemberCount: 2,
      fetchedMemberCount: 2,
      completeness: "complete",
      members: [
        { ...memberA, role: "owner", joinedAt: "2026-08-01T00:00:00Z" },
        { ...memberB, role: "member", joinedAt: "2026-08-01T00:00:00Z" },
      ],
      events: [
        event(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          memberA,
          "2026-08-21T09:00:00",
          "2026-08-21T10:00:00",
        ),
      ],
    };

    const slots = findAvailableHalfHourSlots(snapshot, "2026-08-21");
    expect(slots).toHaveLength(46);
    expect(slots).not.toContain("2026-08-21T09:00:00");
    expect(slots).not.toContain("2026-08-21T09:30:00");
    expect(slots).toContain("2026-08-21T10:00:00");

    expect(
      findAvailableHalfHourSlots(
        { ...snapshot, fetchedMemberCount: 1 },
        "2026-08-21",
      ),
    ).toEqual([]);
    expect(
      findAvailableHalfHourSlots({ ...snapshot, events: [] }, "2026-08-21"),
    ).toHaveLength(48);
  });

  it("予定0件では集約結果を空にする", () => {
    expect(aggregateGroupBusyEvents([])).toEqual([]);
  });
});
