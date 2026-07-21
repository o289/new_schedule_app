import { describe, expect, it } from "vitest";

import type { ScheduleFormDate } from "../../types/schedule";
import { getMostFrequentTimeRange, updateAllDatesTime } from "./scheduleTime";

const dates: ScheduleFormDate[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    startDate: "2026-07-20T01:00:00",
    endDate: "2026-07-20T04:00:00",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    startDate: "2026-07-22T01:00:00",
    endDate: "2026-07-22T04:00:00",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    startDate: "2026-07-25T05:00:00",
    endDate: "2026-07-25T07:00:00",
  },
];

describe("schedule time helpers", () => {
  it("最も多い開始・終了時刻の組み合わせを返す", () => {
    expect(getMostFrequentTimeRange(dates)).toEqual({
      start: "10:00",
      end: "13:00",
    });
  });

  it("同数の場合は最初に現れた組み合わせを返す", () => {
    expect(getMostFrequentTimeRange([dates[2]!, dates[0]!])).toEqual({
      start: "14:00",
      end: "16:00",
    });
  });

  it("すべての日程の時刻を変更し、日付とIDを維持する", () => {
    expect(updateAllDatesTime(dates, { start: "11:00", end: "12:30" })).toEqual(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          startDate: "2026-07-20T02:00:00",
          endDate: "2026-07-20T03:30:00",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          startDate: "2026-07-22T02:00:00",
          endDate: "2026-07-22T03:30:00",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          startDate: "2026-07-25T02:00:00",
          endDate: "2026-07-25T03:30:00",
        },
      ],
    );
  });
});
