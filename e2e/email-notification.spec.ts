import { expect, test } from "./fixtures/auth";
import type { Page } from "@playwright/test";
import type { EmailNotificationSettingsUpdate } from "../packages/schemas/email-notification";

const defaultSettings = {
  globalEnabled: false,
  timezone: "Asia/Tokyo",
  weekdays: Array.from({ length: 7 }, (_, index) => ({
    dayOfWeek: index + 1,
    enabled: false,
    deliveryTime: "09:00",
  })),
};

async function openNotification(page: Page, settings = defaultSettings) {
  await page.route("**/email-notification/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(settings),
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "今日の予定メール" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page.getByRole("region", { name: "今日の予定メール" });
}

test("初期状態は全体OFF・7曜日OFFで表示する", async ({ authenticatedPage }) => {
  const section = await openNotification(authenticatedPage);
  await expect(section.getByRole("checkbox").first()).not.toBeChecked();
  for (const day of [
    "月曜日",
    "火曜日",
    "水曜日",
    "木曜日",
    "金曜日",
    "土曜日",
    "日曜日",
  ]) {
    await expect(section.getByLabel(`${day}に送る`)).not.toBeChecked();
  }
  await expect(
    section.getByText(
      "送信する曜日が選択されていないため、メールを送信しません。",
    ),
  ).toBeVisible();
});

test("曜日OFFでは時刻selectを無効にし48候補を持つ", async ({
  authenticatedPage,
}) => {
  const section = await openNotification(authenticatedPage);
  const monday = section.getByLabel("月曜日", { exact: true });
  await expect(monday).toBeDisabled();
  await expect(monday.locator("option")).toHaveCount(48);
  await section.getByLabel("月曜日に送る").check();
  await expect(monday).toBeEnabled();
});

test("global ONと曜日別時刻を一括保存し、送信条件を再読込できる", async ({
  authenticatedPage,
}) => {
  let savedBody: EmailNotificationSettingsUpdate | undefined;
  await authenticatedPage.route(
    "**/email-notification/settings",
    async (route) => {
      if (route.request().method() === "PUT") {
        savedBody = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(savedBody),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(defaultSettings),
      });
    },
  );
  await authenticatedPage.goto("/dashboard");
  await authenticatedPage
    .getByRole("button", { name: "今日の予定メール" })
    .click();
  const section = authenticatedPage.getByRole("region", {
    name: "今日の予定メール",
  });
  await section.getByRole("checkbox").first().check();
  await section.getByLabel("月曜日に送る").check();
  await section.getByLabel("月曜日", { exact: true }).selectOption("08:30");
  await section.getByRole("button", { name: "通知設定を保存" }).click();
  await expect(section.getByRole("status")).toContainText("保存しました");
  if (!savedBody) throw new Error("保存リクエストがありません");
  expect(savedBody).toMatchObject({ globalEnabled: true });
  expect(savedBody.weekdays[0]).toMatchObject({
    enabled: true,
    deliveryTime: "08:30",
  });
});

test("GET失敗時に再読み込みで復旧できる", async ({ authenticatedPage }) => {
  let failRequests = true;
  await authenticatedPage.route(
    "**/email-notification/settings",
    async (route) => {
      if (route.request().method() === "GET" && failRequests) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "SERVER_ERROR" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(defaultSettings),
      });
    },
  );
  await authenticatedPage.goto("/dashboard");
  await authenticatedPage
    .getByRole("button", { name: "今日の予定メール" })
    .click();
  const failed = authenticatedPage.getByRole("region", {
    name: "今日の予定メール",
  });
  await expect(
    failed.getByText("設定を読み込めませんでした。再読み込みしてください。"),
  ).toBeVisible();
  failRequests = false;
  await failed.getByRole("button", { name: "再読み込み" }).click();
  await expect(failed.getByText("通知を有効にする")).toBeVisible();
});

test("PUT失敗時は入力を保持し、再試行できる", async ({ authenticatedPage }) => {
  let attempts = 0;
  await authenticatedPage.route(
    "**/email-notification/settings",
    async (route) => {
      if (route.request().method() === "PUT" && attempts++ === 0) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "SERVER_ERROR" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          route.request().method() === "PUT"
            ? route.request().postDataJSON()
            : defaultSettings,
        ),
      });
    },
  );
  await authenticatedPage.goto("/dashboard");
  await authenticatedPage
    .getByRole("button", { name: "今日の予定メール" })
    .click();
  const section = authenticatedPage.getByRole("region", {
    name: "今日の予定メール",
  });
  await section.getByLabel("月曜日に送る").check();
  await section.getByLabel("月曜日", { exact: true }).selectOption("08:30");
  await section.getByRole("button", { name: "通知設定を保存" }).click();
  await expect(section.getByLabel("月曜日", { exact: true })).toHaveValue(
    "08:30",
  );
  await section.getByRole("button", { name: "通知設定を保存" }).click();
  await expect(section.getByRole("status")).toContainText("保存しました");
});

test("閉じると未保存入力を破棄し、再openで保存済み設定を表示する", async ({
  authenticatedPage,
}) => {
  const section = await openNotification(authenticatedPage);
  await section.getByLabel("月曜日に送る").check();
  await section.getByLabel("月曜日", { exact: true }).selectOption("08:30");
  await section.getByRole("button", { name: "カレンダーに戻る" }).click();
  await authenticatedPage
    .getByRole("button", { name: "今日の予定メール" })
    .click();
  await expect(
    authenticatedPage
      .getByRole("region", { name: "今日の予定メール" })
      .getByLabel("月曜日", { exact: true }),
  ).toHaveValue("09:00");
});

test("desktopとmobileで通知設定が表示される", async ({ authenticatedPage }) => {
  const section = await openNotification(authenticatedPage);
  await expect(section).toBeVisible();
  await authenticatedPage.setViewportSize({ width: 1440, height: 900 });
  await authenticatedPage.screenshot({
    path: "test-results/email-notification-desktop.png",
    fullPage: false,
  });
  await authenticatedPage.setViewportSize({ width: 390, height: 844 });
  await authenticatedPage.getByRole("button", { name: "メニュー" }).click();
  await expect(authenticatedPage.locator(".MuiDrawer-paper")).toHaveCSS(
    "transform",
    "none",
  );
  const mobileSection = authenticatedPage.getByRole("region", {
    name: "今日の予定メール",
  });
  await expect(mobileSection).toBeVisible();
  await authenticatedPage.screenshot({
    path: "test-results/email-notification-mobile.png",
    fullPage: false,
  });
  await mobileSection.getByLabel("日曜日に送る").scrollIntoViewIfNeeded();
  await authenticatedPage.screenshot({
    path: "test-results/email-notification-mobile-bottom.png",
    fullPage: false,
  });
});
