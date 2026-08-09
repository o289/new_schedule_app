import { describe, expect, it } from "vitest";

import type { ScheduleFormDate } from "#frontend/types/schedule";
import {
  buildScheduleDateRange,
  formatScheduleDateRange,
  getMostFrequentTimeRange,
  updateAllDatesTime,
} from "./scheduleTime";

const dates: ScheduleFormDate[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    startDate: "2026-07-20T10:00:00",
    endDate: "2026-07-20T13:00:00",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    startDate: "2026-07-22T10:00:00",
    endDate: "2026-07-22T13:00:00",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    startDate: "2026-07-25T14:00:00",
    endDate: "2026-07-25T16:00:00",
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
          startDate: "2026-07-20T11:00:00",
          endDate: "2026-07-20T12:30:00",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          startDate: "2026-07-22T11:00:00",
          endDate: "2026-07-22T12:30:00",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          startDate: "2026-07-25T11:00:00",
          endDate: "2026-07-25T12:30:00",
        },
      ],
    );
  });

  it("終了時刻が開始時刻より早ければ終了日を翌日にする", () => {
    expect(
      buildScheduleDateRange("2026-07-22", {
        start: "22:00",
        end: "00:00",
      }),
    ).toEqual({
      startDate: "2026-07-22T22:00:00",
      endDate: "2026-07-23T00:00:00",
    });
  });

  it("月末と年末を跨ぐ終了日を正しく繰り上げる", () => {
    expect(
      buildScheduleDateRange("2026-12-31", {
        start: "23:00",
        end: "05:00",
      }),
    ).toEqual({
      startDate: "2026-12-31T23:00:00",
      endDate: "2027-01-01T05:00:00",
    });
  });

  it("開始時刻と終了時刻が同じ範囲は作成しない", () => {
    expect(() =>
      buildScheduleDateRange("2026-07-22", {
        start: "22:00",
        end: "22:00",
      }),
    ).toThrow();
  });

  it("一括変更でも選択日ごとに終了日を翌日にする", () => {
    expect(
      updateAllDatesTime(dates.slice(0, 2), {
        start: "22:00",
        end: "03:00",
      }),
    ).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        startDate: "2026-07-20T22:00:00",
        endDate: "2026-07-21T03:00:00",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        startDate: "2026-07-22T22:00:00",
        endDate: "2026-07-23T03:00:00",
      },
    ]);
  });

  it("跨日は日付込み、同日はこれまで通り時刻だけで表示する", () => {
    expect(
      formatScheduleDateRange("2026-07-22T22:00:00", "2026-07-23T00:00:00"),
    ).toBe("7月22日 22:00 〜 7月23日 00:00");
    expect(
      formatScheduleDateRange("2026-07-22T10:00:00", "2026-07-22T13:00:00"),
    ).toBe("10:00 - 13:00");
  });
});
