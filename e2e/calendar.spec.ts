import { expect, test } from "./fixtures/auth";

test("デスクトップでは月表示と週表示を切り替えられる", async ({
  authenticatedPage: page,
}) => {
  const calendarView = page.getByRole("group", { name: "カレンダー表示" });

  await expect(
    calendarView.getByRole("button", { name: "月" }),
  ).toHaveAttribute("aria-pressed", "true");
  await calendarView.getByRole("button", { name: "週" }).click();
  await expect(
    calendarView.getByRole("button", { name: "週" }),
  ).toHaveAttribute("aria-pressed", "true");
});
