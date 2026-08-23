import { mkdir } from "node:fs/promises";

import { expect, test as setup } from "@playwright/test";

import { resetE2EDatabase } from "./helpers/database";
import {
  createE2EEmail,
  installVirtualAuthenticator,
  virtualCredentialCount,
} from "./helpers/webauthn";
import { getE2EEnvironment } from "./environment";
import { authStatePath } from "./fixtures/auth";

const environment = getE2EEnvironment();

setup("認証済みE2Eユーザーを作成する", async ({ context, page }) => {
  await resetE2EDatabase(environment.databaseUrl);
  await installVirtualAuthenticator(context);

  await page.goto("/");
  await page.getByLabel("メールアドレス").fill(createE2EEmail("setup"));
  await page.getByRole("button", { name: "アプリの利用を開始" }).click();
  await page.getByLabel("表示名").fill("E2E テストユーザー");
  await page.getByRole("button", { name: "登録して利用を開始" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect
    .poll(() => virtualCredentialCount(context, environment.webauthnRpId))
    .toBe(1);

  await mkdir("e2e/.auth", { recursive: true });
  await context.storageState({ path: authStatePath });
});
