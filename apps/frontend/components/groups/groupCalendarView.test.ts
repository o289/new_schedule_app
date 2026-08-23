import { describe, expect, it } from "vitest";

import type { GroupDailyBusySegment } from "./groupCalendarSegments";
import {
  formatGroupCalendarEventTime,
  formatGroupCalendarEventTimeRange,
  getGroupCalendarRange,
  getInitialGroupCalendarRange,
  toGroupCalendarEvents,
} from "./groupCalendarView";

const segment: GroupDailyBusySegment = {
  day: "2026-08-23",
  startDate: "2026-08-23T09:00:00",
  endDate: "2026-08-23T10:00:00",
  memberCount: 1,
  memberIds: ["11111111-1111-4111-8111-111111111111"],
  events: [
    {
      dateId: "22222222-2222-4222-8222-222222222222",
      member: {
        userId: "11111111-1111-4111-8111-111111111111",
        name: "メンバー",
        avatar: null,
      },
      startDate: "2026-08-23T09:00:00",
      endDate: "2026-08-23T10:00:00",
      day: "2026-08-23",
    },
  ],
};

describe("group calendar view adapter", () => {
  it("Asia/Tokyoの週境界をローカル日時文字列として作る", () => {
    expect(
      getInitialGroupCalendarRange(new Date("2026-08-19T15:30:00Z")),
    ).toEqual({
      startDate: "2026-08-16T00:00:00",
      endDate: "2026-08-23T00:00:00",
    });
    expect(
      getGroupCalendarRange(
        new Date("2026-08-22T15:00:00Z"),
        new Date("2026-08-29T15:00:00Z"),
      ),
    ).toEqual({
      startDate: "2026-08-23T00:00:00",
      endDate: "2026-08-30T00:00:00",
    });
  });

  it("集約済み予定を予定ありだけの週表示イベントへ変換する", () => {
    expect(toGroupCalendarEvents([segment])).toMatchObject([
      {
        title: "予定あり",
        start: "2026-08-23T09:00:00",
        end: "2026-08-23T10:00:00",
        extendedProps: { segment },
      },
    ]);
  });

  it("詳細の日時をUTC変換せずローカル日時として表示する", () => {
    expect(formatGroupCalendarEventTime("2026-08-23T09:30:00")).toBe(
      "2026年08月23日 09:30",
    );
  });

  it("同日なら時刻のみ、日跨ぎなら終了時刻に翌日を付けて表示する", () => {
    expect(
      formatGroupCalendarEventTimeRange(
        "2026-08-23T09:30:00",
        "2026-08-23T10:30:00",
      ),
    ).toBe("09:30〜10:30");
    expect(
      formatGroupCalendarEventTimeRange(
        "2026-08-23T23:30:00",
        "2026-08-24T01:00:00",
      ),
    ).toBe("23:30〜翌日 01:00");
  });
});
