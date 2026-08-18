import { describe, expect, it } from "vitest";

import { sortTimeGroupDates } from "./DateTimeCard";

describe("sortTimeGroupDates", () => {
  it("対象日を日付の昇順に並べる", () => {
    const dates = [
      {
        id: "3",
        date: "2026-01-03",
        endDate: "2026-01-03",
        isPast: false,
      },
      {
        id: "1",
        date: "2026-01-01",
        endDate: "2026-01-01",
        isPast: false,
      },
      {
        id: "2",
        date: "2026-01-02",
        endDate: "2026-01-02",
        isPast: false,
      },
    ];

    expect(sortTimeGroupDates(dates).map((date) => date.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(dates.map((date) => date.date)).toEqual([
      "2026-01-03",
      "2026-01-01",
      "2026-01-02",
    ]);
  });
});
