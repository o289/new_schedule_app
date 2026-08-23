import type { Browser, BrowserContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures/auth";
import { createE2EName } from "./helpers/calendar";
import { countGroupMembers } from "./helpers/database";
import {
  createE2EEmail,
  installVirtualAuthenticator,
} from "./helpers/webauthn";
import { getE2EEnvironment } from "./environment";

const environment = getE2EEnvironment();

test.setTimeout(120_000);

async function createUnauthenticatedPage(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext({
    baseURL: environment.webauthnOrigin,
    storageState: { cookies: [], origins: [] },
  });
  await installVirtualAuthenticator(context);
  return { context, page: await context.newPage() };
}

async function register(page: Page, prefix: string, name: string) {
  await page.getByLabel("メールアドレス").fill(createE2EEmail(prefix));
  await page.getByRole("button", { name: "アプリの利用を開始" }).click();
  await page.getByLabel("表示名").fill(name);
  await page.getByRole("button", { name: "登録して利用を開始" }).click();
}

test("招待リンクは認証後復帰・再発行・手動コード参加に対応する", async ({
  authenticatedPage: ownerPage,
  browser,
  context: ownerContext,
}) => {
  const groupName = createE2EName("group-invitation");

  await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: environment.webauthnOrigin,
  });
  await ownerPage.getByRole("button", { name: "グループ" }).click();
  await ownerPage.getByRole("button", { name: "作成する" }).click();
  await ownerPage.getByLabel("グループ名").fill(groupName);
  const createdResponsePromise = ownerPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/groups" &&
      response.request().method() === "POST",
  );
  await ownerPage.getByRole("button", { name: "作成する" }).last().click();
  const createdBody = (await (await createdResponsePromise).json()) as {
    group: { id: string };
    joinCode: string;
  };
  const originalLink = `${environment.webauthnOrigin}/join#${createdBody.joinCode}`;

  await expect(
    ownerPage.getByRole("button", { name: "リンクをコピー" }),
  ).toBeVisible();
  await ownerPage.getByRole("button", { name: "リンクをコピー" }).click();
  await expect
    .poll(() => ownerPage.evaluate(() => navigator.clipboard.readText()))
    .toBe(originalLink);
  await ownerPage.getByRole("button", { name: "閉じる" }).click();

  const firstInvitee = await createUnauthenticatedPage(browser);
  try {
    await firstInvitee.page.goto(originalLink);
    await expect(firstInvitee.page).toHaveURL(originalLink);
    await expect
      .poll(() =>
        countGroupMembers(environment.databaseUrl, createdBody.group.id),
      )
      .toBe(1);

    await register(firstInvitee.page, "invite-link", "招待リンク参加者");
    await expect(firstInvitee.page).toHaveURL(originalLink);
    await expect(
      firstInvitee.page.getByRole("heading", { name: "グループへの招待" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        countGroupMembers(environment.databaseUrl, createdBody.group.id),
      )
      .toBe(1);

    await firstInvitee.page.getByRole("button", { name: "参加する" }).click();
    await expect(firstInvitee.page).toHaveURL(/\/dashboard$/);
    await expect
      .poll(() =>
        countGroupMembers(environment.databaseUrl, createdBody.group.id),
      )
      .toBe(2);
    expect(await firstInvitee.page.evaluate(() => window.location.hash)).toBe(
      "",
    );
    expect(
      await firstInvitee.page.evaluate(
        (token) =>
          [
            ...Object.values(localStorage),
            ...Object.values(sessionStorage),
          ].some((value) => value.includes(token)),
        createdBody.joinCode,
      ),
    ).toBe(false);
  } finally {
    await firstInvitee.context.close().catch(() => undefined);
  }

  await ownerPage.getByRole("button", { name: "メンバーを招待" }).click();
  await ownerPage
    .getByRole("button", { name: "新しい招待リンクを発行" })
    .click();
  const regeneratedResponsePromise = ownerPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/groups/${createdBody.group.id}/invitation` &&
      response.request().method() === "POST",
  );
  await ownerPage.getByRole("button", { name: "発行する" }).click();
  const regeneratedBody = (await (await regeneratedResponsePromise).json()) as {
    joinCode: string;
  };
  expect(regeneratedBody.joinCode).not.toBe(createdBody.joinCode);
  await ownerPage.getByRole("button", { name: "閉じる" }).click();

  const secondInvitee = await createUnauthenticatedPage(browser);
  try {
    await secondInvitee.page.goto(originalLink);
    await register(secondInvitee.page, "old-invite", "旧リンク確認者");
    await secondInvitee.page.getByRole("button", { name: "参加する" }).click();
    await expect(
      secondInvitee.page.getByText("参加コードが正しくありません"),
    ).toBeVisible();
    await expect
      .poll(() =>
        countGroupMembers(environment.databaseUrl, createdBody.group.id),
      )
      .toBe(2);

    const regeneratedLink = `${environment.webauthnOrigin}/join#${regeneratedBody.joinCode}`;
    await secondInvitee.page.goto(regeneratedLink);
    await secondInvitee.page.getByRole("button", { name: "参加する" }).click();
    await expect(secondInvitee.page).toHaveURL(/\/dashboard$/);
    await expect
      .poll(() =>
        countGroupMembers(environment.databaseUrl, createdBody.group.id),
      )
      .toBe(3);
  } finally {
    await secondInvitee.context.close().catch(() => undefined);
  }

  const manualInvitee = await createUnauthenticatedPage(browser);
  try {
    await manualInvitee.page.goto("/");
    await register(manualInvitee.page, "manual-invite", "コード参加者");
    await expect(manualInvitee.page).toHaveURL(/\/dashboard$/);
    await manualInvitee.page.getByRole("button", { name: "グループ" }).click();
    await manualInvitee.page.getByRole("button", { name: "参加する" }).click();
    await manualInvitee.page
      .getByLabel("参加コード")
      .fill(regeneratedBody.joinCode);
    await manualInvitee.page
      .getByRole("button", { name: "参加する" })
      .last()
      .click();
    await expect
      .poll(() =>
        countGroupMembers(environment.databaseUrl, createdBody.group.id),
      )
      .toBe(4);
  } finally {
    await manualInvitee.context.close().catch(() => undefined);
  }
});
