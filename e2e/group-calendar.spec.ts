import { expect, test } from "./fixtures/auth";
import { createE2EName } from "./helpers/calendar";

test("グループカレンダーは予定編集なしの週7列で表示できる", async ({
  authenticatedPage: page,
}) => {
  const groupName = createE2EName("group-calendar");

  await page.getByRole("button", { name: "グループ" }).click();
  await page.getByRole("button", { name: "作成する" }).click();
  await page.getByLabel("グループ名").fill(groupName);
  await page.getByRole("button", { name: "作成する" }).last().click();
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(
    page.getByRole("heading", { name: groupName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "メンバーを招待" }),
  ).toBeVisible();

  await expect(page.locator(".fc-timegrid-col[data-date]")).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "前の週を表示" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "次の週を表示" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "スケジュール登録" }),
  ).toHaveCount(0);

  await page.getByLabel("表示するカレンダー").click();
  await page.getByRole("option", { name: "マイカレンダー" }).click();
  await expect(
    page.getByRole("button", { name: "スケジュール登録" }),
  ).toBeVisible();

  await page.getByLabel("表示するカレンダー").click();
  await page.getByRole("option", { name: groupName }).click();
  await expect(page.locator(".fc-timegrid-col[data-date]")).toHaveCount(7);

  await page.setViewportSize({ width: 320, height: 720 });
  const calendarScroll = page.locator(".group-calendar-scroll");
  await expect
    .poll(() =>
      calendarScroll.evaluate((element) => {
        const container = element as HTMLElement;
        return container.scrollWidth > container.clientWidth;
      }),
    )
    .toBe(true);
});
