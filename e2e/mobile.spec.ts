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

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "予定を追加" }).click();
  await expect(page.getByRole("radio", { name: "本登録" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "本登録" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "仮押さえ" })).toBeVisible();
  const allowOverwrite = page.getByRole("switch", {
    name: "上書きされることを許可",
  });
  await expect(allowOverwrite).not.toBeChecked();
  await expect(page.getByText(/すべての日付がなくなると/)).toBeVisible();
  await expect(page.getByRole("button", { name: "完了" })).toBeVisible();
  await allowOverwrite.check();
  await expect(allowOverwrite).toBeChecked();
});
