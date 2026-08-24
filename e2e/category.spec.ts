import { expect, test } from "./fixtures/auth";
import {
  createCategory,
  createE2EName,
  openScheduleForm,
  returnToCalendarAside,
  selectMuiOption,
} from "./helpers/calendar";

test("カテゴリーを作成・更新・削除し、予定フォームの選択肢へ反映する", async ({
  authenticatedPage: page,
}) => {
  const categoryName = createE2EName("category");
  const updatedCategoryName = `${categoryName}-更新`;

  await createCategory(page, {
    name: categoryName,
    color: "blue",
    icon: "work",
  });
  await returnToCalendarAside(page);

  await openScheduleForm(page);
  await selectMuiOption(page, "カテゴリーを選択", categoryName);
  await expect(
    page.getByRole("combobox", { name: categoryName }),
  ).toBeVisible();
  await page.getByRole("button", { name: "戻る" }).click();

  await page.getByRole("button", { name: "カテゴリーを管理" }).click();
  await page.getByRole("button", { name: `${categoryName}を編集` }).click();
  await page.getByLabel("カテゴリ名").fill(updatedCategoryName);
  await page.getByLabel("カテゴリの色").selectOption("green");
  await page.getByLabel("カテゴリのアイコン").selectOption("school");
  await page.getByRole("button", { name: "更新" }).click();
  await expect(
    page.getByText(updatedCategoryName, { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: `${updatedCategoryName}を削除` })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(
    page.getByText(updatedCategoryName, { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: `${updatedCategoryName}を削除` })
    .click();
  await page.getByRole("button", { name: "実行する" }).click();
  await expect(
    page.getByText(updatedCategoryName, { exact: true }),
  ).not.toBeVisible();
});
