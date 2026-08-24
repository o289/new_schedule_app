import {
  expect,
  test,
  type Page,
  type Response as PlaywrightResponse,
} from "@playwright/test";

import {
  createE2EEmail,
  installVirtualAuthenticator,
  virtualCredentialCount,
} from "./helpers/webauthn";
import { getE2EEnvironment } from "./environment";

const environment = getE2EEnvironment();

test.use({ storageState: { cookies: [], origins: [] } });

async function registerAndLogin(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "アプリの利用を開始" }).click();

  const nameInput = page.getByLabel("表示名");
  await Promise.race([
    expect(page).toHaveURL(/\/dashboard$/),
    nameInput.waitFor({ state: "visible" }),
  ]);
  if (await nameInput.isVisible()) {
    await nameInput.fill("E2E テストユーザー");
    await page.getByRole("button", { name: "登録して利用を開始" }).click();
  }
  await expect(page).toHaveURL(/\/dashboard$/);
}

type AuthenticationResponse = {
  path: string;
  status: number;
  body: unknown;
};

function recordAuthenticationResponses(page: Page): {
  read: () => Promise<AuthenticationResponse[]>;
} {
  const responses: Promise<AuthenticationResponse>[] = [];

  page.on("response", (response: PlaywrightResponse) => {
    const url = new URL(response.url());

    if (!url.pathname.startsWith("/auth/")) {
      return;
    }

    responses.push(
      response.json().then((body: unknown) => ({
        path: url.pathname,
        status: response.status(),
        body,
      })),
    );
  });

  return { read: () => Promise.all(responses) };
}

test("初回メールアドレスで登録後にログインし、dashboardを表示する", async ({
  context,
  page,
}) => {
  await installVirtualAuthenticator(context);
  const authResponses = recordAuthenticationResponses(page);
  const email = createE2EEmail("signup");

  await registerAndLogin(page, email);

  await expect
    .poll(() => virtualCredentialCount(context, environment.webauthnRpId))
    .toBe(1);
  await expect
    .poll(() => authResponses.read())
    .toEqual(
      expect.arrayContaining([
        {
          path: "/auth/passkey/login/options",
          status: 400,
          body: { code: "PASSKEY_NOT_FOUND" },
        },
        {
          path: "/auth/passkey/register/options",
          status: 200,
          body: expect.objectContaining({ data: expect.any(Object) }),
        },
        {
          path: "/auth/passkey/register/verify",
          status: 200,
          body: { data: null },
        },
        {
          path: "/auth/passkey/login/options",
          status: 200,
          body: expect.objectContaining({ data: expect.any(Object) }),
        },
        {
          path: "/auth/passkey/login/verify",
          status: 200,
          body: expect.objectContaining({
            data: expect.objectContaining({
              access_token: expect.any(String),
              refresh_token: expect.any(String),
            }),
          }),
        },
        {
          path: "/auth/me",
          status: 200,
          body: {
            email,
            name: "E2E テストユーザー",
            avatar: null,
          },
        },
      ]),
    );
});

test("登録済みメールアドレスでパスキーを使って再ログインできる", async ({
  context,
  page,
}) => {
  await installVirtualAuthenticator(context);
  const email = createE2EEmail("login");

  await registerAndLogin(page, email);
  await page.evaluate(() => localStorage.clear());

  await registerAndLogin(page, email);
  await expect
    .poll(() => virtualCredentialCount(context, environment.webauthnRpId))
    .toBe(1);
});

test("ログアウトでセッションを削除し、dashboardを保護する", async ({
  context,
  page,
}) => {
  await installVirtualAuthenticator(context);
  await registerAndLogin(page, createE2EEmail("logout"));

  await page.goto("/setting");
  await page.getByRole("button", { name: "この端末からログアウト" }).click();

  await expect(page).toHaveURL("/");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        accessToken: localStorage.getItem("accessToken"),
        refreshToken: localStorage.getItem("refreshToken"),
      })),
    )
    .toEqual({ accessToken: null, refreshToken: null });

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/");
});

test("不正なsessionでは認証画面へ戻る", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("accessToken", "invalid-access-token");
    localStorage.setItem("refreshToken", "invalid-refresh-token");
  });

  await page.goto("/dashboard");

  await expect(page).toHaveURL("/");
  await expect(page.getByLabel("メールアドレス")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        accessToken: localStorage.getItem("accessToken"),
        refreshToken: localStorage.getItem("refreshToken"),
      })),
    )
    .toEqual({ accessToken: null, refreshToken: null });
});

test("パスキー取得に失敗しても登録フローへ進まない", async ({
  browser,
  context,
  page,
}) => {
  await installVirtualAuthenticator(context);
  const email = createE2EEmail("passkey-failure");
  await registerAndLogin(page, email);

  const emptyAuthenticatorContext = await browser.newContext();
  await installVirtualAuthenticator(emptyAuthenticatorContext);
  const emptyAuthenticatorPage = await emptyAuthenticatorContext.newPage();
  let registerOptionsRequests = 0;

  emptyAuthenticatorPage.on("request", (request) => {
    if (request.url().endsWith("/auth/passkey/register/options")) {
      registerOptionsRequests += 1;
    }
  });

  try {
    await emptyAuthenticatorPage.goto("/");
    await emptyAuthenticatorPage.getByLabel("メールアドレス").fill(email);
    await emptyAuthenticatorPage
      .getByRole("button", { name: "アプリの利用を開始" })
      .click();

    await expect(emptyAuthenticatorPage).toHaveURL("/");
    await expect(emptyAuthenticatorPage.getByRole("alert")).toBeVisible();
    await expect.poll(() => registerOptionsRequests).toBe(0);
  } finally {
    await emptyAuthenticatorContext.close();
  }
});
