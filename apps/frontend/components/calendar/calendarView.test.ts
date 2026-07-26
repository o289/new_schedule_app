import { describe, expect, it } from "vitest";

import {
  formatDesktopCalendarTitle,
  moveDesktopCalendarDate,
  toFullCalendarView,
} from "./calendarView";

describe("calendar view helpers", () => {
  it.each([
    ["month", "dayGridMonth"],
    ["week", "timeGridWeek"],
    ["day", "timeGridDay"],
  ] as const)("%sをFullCalendarのビュー名へ変換する", (view, expected) => {
    expect(toFullCalendarView(view)).toBe(expected);
  });

  it("月表示を1か月進める", () => {
    const result = moveDesktopCalendarDate(new Date(2026, 6, 20), "month", 1);

    expect(result).toEqual(new Date(2026, 7, 20));
  });

  it("移動先に同じ日がない場合は月末へ合わせる", () => {
    const result = moveDesktopCalendarDate(new Date(2026, 0, 31), "month", 1);

    expect(result).toEqual(new Date(2026, 1, 28));
  });

  it("週表示を7日進める", () => {
    const result = moveDesktopCalendarDate(new Date(2026, 6, 20), "week", 1);

    expect(result).toEqual(new Date(2026, 6, 27));
  });

  it("月表示のタイトルに年月を表示する", () => {
    expect(formatDesktopCalendarTitle(new Date(2026, 6, 20), "month")).toBe(
      "2026年7月",
    );
  });

  it("週表示のタイトルに日曜から土曜までを表示する", () => {
    expect(formatDesktopCalendarTitle(new Date(2026, 6, 22), "week")).toBe(
      "7月19日〜7月25日",
    );
  });
});
