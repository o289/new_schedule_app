import { expect, test } from "@playwright/test";

import { getE2EEnvironment } from "./environment";

const environment = getE2EEnvironment();

test("カテゴリーAPIの500エラーを利用者向けAlertとして表示する", async ({
  page,
}) => {
  await page.route(`${environment.apiUrl}/categories`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "INTERNAL_SERVER_ERROR" }),
    }),
  );

  await page.goto("/dashboard");

  await expect(
    page.getByText(
      "サーバーエラーが発生しました。ご迷惑をおかけして大変申し訳ございませんでした",
    ),
  ).toBeVisible();
});

test("予定APIの遅延中はLoadingを表示し、応答後に画面を表示する", async ({
  page,
}) => {
  let releaseResponse: (() => void) | undefined;
  const responseReleased = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });

  await page.route(`${environment.apiUrl}/schedules`, async (route) => {
    await responseReleased;
    await route.continue();
  });

  await page.goto("/dashboard");
  await expect(page.getByLabel("Loading…")).toBeVisible();

  releaseResponse?.();
  await expect(page.getByLabel("Loading…")).toBeHidden();
});

test("refresh失敗時はsessionを破棄して認証画面へ戻る", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem("accessToken", "invalid-access-token");
    localStorage.setItem("refreshToken", "invalid-refresh-token");
  });
  await context.route(`${environment.apiUrl}/auth/me`, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "HTTP_ERROR" }),
    }),
  );
  await context.route(`${environment.apiUrl}/auth/refresh`, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "INVALID_REFRESH_TOKEN" }),
    }),
  );

  const page = await context.newPage();

  try {
    await page.goto("/dashboard");

    await expect(page).toHaveURL("/");
    await expect(page.getByLabel("メールアドレス")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("HTML応答を有効なJSONとして扱わず、Alertを表示する", async ({ page }) => {
  await page.route(`${environment.apiUrl}/categories`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>unexpected response</body></html>",
    }),
  );

  await page.goto("/dashboard");

  await expect(
    page.getByText("サーバーから正しい応答を受け取れませんでした"),
  ).toBeVisible();
});
