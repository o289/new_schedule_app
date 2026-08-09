import { expect, test } from "./fixtures/auth";

test("認証fixtureのstorageStateでdashboardを開ける", async ({
  authenticatedPage,
}) => {
  await expect(
    authenticatedPage.getByRole("button", { name: "ログアウト" }),
  ).toBeVisible();
});
