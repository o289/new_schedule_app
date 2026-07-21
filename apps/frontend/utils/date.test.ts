import { describe, expect, it } from "vitest";

import { formatDateTime, getLocalDateTimeParts, toISODatetime } from "./date";

describe("日本時間の日時文字列", () => {
  it("入力時刻をタイムゾーンなしISO文字列へ変換する", () => {
    expect(toISODatetime("2026-07-22", "10:00")).toBe("2026-07-22T10:00:00");
  });

  it("日時文字列を変換せず表示用パーツに分ける", () => {
    expect(formatDateTime("2026-07-22T10:00:00", "time")).toBe("10:00");
    expect(getLocalDateTimeParts("2026-07-22T10:00:00")).toEqual({
      date: "2026-07-22",
      time: "10:00",
    });
  });
});
