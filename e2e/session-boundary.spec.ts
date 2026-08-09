import { expect, test } from "./fixtures/auth";
import {
  createCategory,
  createE2EName,
  fillScheduleForm,
  openScheduleForm,
  returnToCalendarAside,
} from "./helpers/calendar";
import { installVirtualAuthenticator } from "./helpers/webauthn";

test("ログアウト後に別ユーザーへ切り替えても前ユーザーの予定とカテゴリーを表示しない", async ({
  authenticatedPage: page,
  context,
}) => {
  const categoryName = createE2EName("previous-user-category");
  const scheduleTitle = createE2EName("previous-user-schedule");

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
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "ログアウト" }).click();
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
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(categoryName, { exact: true })).not.toBeVisible();
  await expect(
    page.getByText(scheduleTitle, { exact: true }),
  ).not.toBeVisible();
});
