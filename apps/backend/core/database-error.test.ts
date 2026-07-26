import { describe, expect, it } from "vitest";

import { hasDatabaseErrorCode } from "./database-error";

describe("hasDatabaseErrorCode", () => {
  it("直接返されたSQLSTATEを判定する", () => {
    expect(hasDatabaseErrorCode({ code: "23503" }, "23503")).toBe(true);
  });

  it("DrizzleのcauseにあるSQLSTATEを判定する", () => {
    expect(hasDatabaseErrorCode({ cause: { code: "23P01" } }, "23P01")).toBe(
      true,
    );
  });

  it("異なるエラーコードと非エラー値は判定しない", () => {
    expect(hasDatabaseErrorCode({ code: "23503" }, "23P01")).toBe(false);
    expect(hasDatabaseErrorCode(null, "23503")).toBe(false);
  });
});
