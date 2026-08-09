import { describe, expect, it } from "vitest";

import {
  addDaysToISODate,
  formatDate,
  getLocalDateTimeParts,
  isSameDate,
  toISODatetime,
} from "#utils/local-datetime";
import { formatDateTime } from "./date";

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

  it("UTC変換せず日付だけを翌日に進める", () => {
    expect(addDaysToISODate("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysToISODate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("Dateをローカル日付としてYYYY-MM-DDへ整形し、同日判定する", () => {
    const morning = new Date(2026, 6, 22, 9, 0);
    const evening = new Date(2026, 6, 22, 21, 0);

    expect(formatDate(morning)).toBe("2026-07-22");
    expect(isSameDate(morning, evening)).toBe(true);
  });
});
