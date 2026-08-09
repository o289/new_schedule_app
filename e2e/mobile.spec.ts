import { expect, test } from "./fixtures/auth";

test("モバイルでは月表示、日表示、Drawerを操作できる", async ({
  authenticatedPage: page,
}) => {
  await expect(page.getByRole("button", { name: "メニュー" })).toBeVisible();
  await expect(page.getByRole("button", { name: "予定を追加" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "カテゴリーを管理" }),
  ).toBeVisible();

  const initialMonth = await page
    .getByRole("heading", { level: 2 })
    .textContent();
  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.getByRole("heading", { level: 2 })).not.toHaveText(
    initialMonth ?? "",
  );

  await page.getByRole("button", { name: "今日" }).click();
  await expect(
    page.getByRole("button", { name: "カレンダーへ戻る" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "カレンダーへ戻る" }).click();
  await expect(page.getByRole("button", { name: "メニュー" })).toBeVisible();

  await page.getByRole("button", { name: "メニュー" }).click();
  await expect(page.getByText("マイカレンダー", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "カテゴリーを管理" }).click();
  await expect(
    page.getByRole("heading", { name: "カテゴリ作成" }),
  ).toBeVisible();
});
