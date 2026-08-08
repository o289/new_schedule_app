import { expect, test } from "@playwright/test";

test("EntrancePageとBackendへ到達でき、未認証のdashboardは保護される", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const pingResponse = await page.request.get("http://localhost:8000/ping");
  await expect(pingResponse).toBeOK();
  await expect(pingResponse.json()).resolves.toEqual({ message: "pong" });

  await page.goto("/");

  await expect(page.getByText("スケジュール管理")).toBeVisible();
  await expect(page.getByLabel("メールアドレス")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/");
  await expect(page.getByLabel("メールアドレス")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
