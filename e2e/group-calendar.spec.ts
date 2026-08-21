import { expect, test } from "./fixtures/auth";
import { createE2EName } from "./helpers/calendar";

test("グループカレンダーは予定編集なしの週7列で表示できる", async ({
  authenticatedPage: page,
}) => {
  const groupName = createE2EName("group-calendar");

  await page.goto("/groups");
  await page.getByRole("button", { name: "作成する" }).click();
  await page.getByLabel("グループ名").fill(groupName);
  await page.getByRole("button", { name: "作成する" }).last().click();
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("link", { name: new RegExp(groupName) }).click();
  await page.getByRole("button", { name: "カレンダーを見る" }).click();

  await expect(
    page.getByRole("heading", { name: "グループカレンダー" }),
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

  await page.setViewportSize({ width: 320, height: 720 });
  const isHorizontallyScrollable = await page
    .locator(".group-calendar-scroll")
    .evaluate((element) => {
      const container = element as HTMLElement;
      return container.scrollWidth > container.clientWidth;
    });
  expect(isHorizontallyScrollable).toBe(true);
});
