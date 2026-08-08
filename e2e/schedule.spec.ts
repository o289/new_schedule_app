import { expect, test } from "./fixtures/auth";
import {
  createCategory,
  createE2EName,
  fillScheduleForm,
  openScheduleForm,
  returnToCalendarAside,
  selectMuiOption,
} from "./helpers/calendar";

test("予定を作成・更新・削除し、カレンダーと詳細へ反映する", async ({
  authenticatedPage: page,
}) => {
  const categoryName = createE2EName("schedule-category");
  const updatedCategoryName = `${categoryName}-更新`;
  const title = createE2EName("schedule");
  const updatedTitle = `${title}-更新`;

  await createCategory(page, {
    name: categoryName,
    color: "orange",
    icon: "meeting",
  });
  await returnToCalendarAside(page);
  await openScheduleForm(page);
  await fillScheduleForm(page, {
    title,
    note: "作成時のメモ",
    categoryName,
    start: "10:00",
    end: "11:00",
    dateOffsets: [0],
  });
  await page.getByRole("button", { name: "完了" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByRole("button", { name: "カテゴリーを管理" }).click();
  await page.getByRole("button", { name: `${categoryName}を編集` }).click();
  await page.getByLabel("カテゴリ名").fill(updatedCategoryName);
  await page.getByRole("button", { name: "更新" }).click();
  await returnToCalendarAside(page);

  await page.getByText(title, { exact: true }).click();
  await expect(page.getByText("作成時のメモ", { exact: true })).toBeVisible();
  await expect(
    page.getByText(updatedCategoryName, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10:00 - 11:00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("予定タイトル").fill(updatedTitle);
  await page.getByLabel("予定メモ").fill("更新後のメモ");
  await selectMuiOption(page, "開始時刻", "11:00");
  await selectMuiOption(page, "終了時刻", "12:30");
  await page.getByRole("button", { name: "完了" }).click();
  await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByText(updatedTitle, { exact: true }).click();
  await expect(page.getByText("更新後のメモ", { exact: true })).toBeVisible();
  await expect(page.getByText("11:00 - 12:30", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "いいえ" }).click();
  await expect(
    page.getByRole("heading", { name: updatedTitle, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "はい" }).click();
  await expect(
    page.getByRole("heading", { name: updatedTitle, level: 1 }),
  ).toHaveCount(0);
  await expect(page.locator("a").filter({ hasText: updatedTitle })).toHaveCount(
    0,
  );
});

test("複数日程の仮押さえを日跨ぎで登録する", async ({
  authenticatedPage: page,
}) => {
  const categoryName = createE2EName("tentative-category");
  const title = createE2EName("tentative");

  await createCategory(page, {
    name: categoryName,
    color: "purple",
    icon: "event",
  });
  await returnToCalendarAside(page);
  await openScheduleForm(page);
  await fillScheduleForm(page, {
    title,
    note: "複数日程の仮押さえ",
    categoryName,
    start: "22:00",
    end: "01:00",
    dateOffsets: [0, 1],
    tentative: true,
  });

  await expect(
    page.getByText("終了時刻は選択日の翌日として登録されます。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "登録済み日程を見る" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "登録済み日程", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "完了" }).click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByText(title, { exact: true }).first().click();
  await expect(page.getByLabel("仮押さえ・未確定の予定")).toBeVisible();
  await expect(page.getByText("他の日程", { exact: true })).toBeVisible();
});
