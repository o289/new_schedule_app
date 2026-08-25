import { expect, test } from "@playwright/test";
import {
  createCategory,
  createE2EName,
  fillScheduleForm,
  openScheduleForm,
  returnToCalendarAside,
} from "./helpers/calendar";
import { installVirtualAuthenticator } from "./helpers/webauthn";

test.use({ storageState: { cookies: [], origins: [] } });

test("ログアウト後に別ユーザーへ切り替えても前ユーザーの予定とカテゴリーを表示しない", async ({
  page,
  context,
}) => {
  const categoryName = createE2EName("previous-user-category");
  const scheduleTitle = createE2EName("previous-user-schedule");

  await installVirtualAuthenticator(context);
  await page.goto("/");
  await page
    .getByLabel("メールアドレス")
    .fill(`${createE2EName("previous-user")}@e2e.test`);
  await page.getByRole("button", { name: "アプリの利用を開始" }).click();
  await page.getByLabel("表示名").fill("前のE2Eユーザー");
  await page.getByRole("button", { name: "登録して利用を開始" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await createCategory(page, {
    name: categoryName,
    color: "teal",
    icon: "book",
  });
  await returnToCalendarAside(page);
  await openScheduleForm(page);
  await fillScheduleForm(page, {
    title: scheduleTitle,
    note: "前ユーザーだけの予定",
    categoryName,
    start: "13:00",
    end: "14:00",
    dateOffsets: [0],
  });
  await page.getByRole("button", { name: "完了" }).click();
  await expect(page.getByText(scheduleTitle, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る" }).click();
  await page.goto("/setting");
  await page.getByRole("button", { name: "この端末からログアウト" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(categoryName, { exact: true })).not.toBeVisible();
  await expect(
    page.getByText(scheduleTitle, { exact: true }),
  ).not.toBeVisible();

  await installVirtualAuthenticator(context);
  await page
    .getByLabel("メールアドレス")
    .fill(`${createE2EName("next-user")}@e2e.test`);
  await page.getByRole("button", { name: "アプリの利用を開始" }).click();
  await page.getByLabel("表示名").fill("次のE2Eユーザー");
  await page.getByRole("button", { name: "登録して利用を開始" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(categoryName, { exact: true })).not.toBeVisible();
  await expect(
    page.getByText(scheduleTitle, { exact: true }),
  ).not.toBeVisible();
});
