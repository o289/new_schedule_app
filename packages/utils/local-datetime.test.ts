import { describe, expect, it } from "vitest";

import { normalizeLocalDateTime } from "./local-datetime";

describe("normalizeLocalDateTime", () => {
  it("DBの空白区切りをT区切りへ変換する", () => {
    expect(normalizeLocalDateTime("2026-08-28 10:30:00")).toBe(
      "2026-08-28T10:30:00",
    );
  });

  it("T区切りのローカル日時を変更しない", () => {
    expect(normalizeLocalDateTime("2026-08-28T10:30:00")).toBe(
      "2026-08-28T10:30:00",
    );
  });
});
