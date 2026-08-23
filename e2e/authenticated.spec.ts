import { expect, test } from "./fixtures/auth";

test("認証fixtureのstorageStateでdashboardを開ける", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/setting");
  await expect(
    authenticatedPage.getByRole("button", { name: "ログアウト" }),
  ).toBeVisible();
});
