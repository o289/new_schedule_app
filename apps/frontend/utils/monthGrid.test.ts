import { describe, expect, it } from "vitest";

import { generateMonthGrid, getCurrentMonthWeekdayDates } from "./monthGrid";

describe("month grid weekday dates", () => {
  const weeks = generateMonthGrid(2026, 8);

  it("当月の水曜日だけを返す", () => {
    expect(getCurrentMonthWeekdayDates(weeks, 3)).toEqual([
      "2026-08-05",
      "2026-08-12",
      "2026-08-19",
      "2026-08-26",
    ]);
  });

  it("前月・翌月の補完日を含めない", () => {
    expect(getCurrentMonthWeekdayDates(weeks, 6)).toEqual([
      "2026-08-01",
      "2026-08-08",
      "2026-08-15",
      "2026-08-22",
      "2026-08-29",
    ]);
  });
});
