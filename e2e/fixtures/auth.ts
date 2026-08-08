import { expect, test as base, type Page } from "@playwright/test";

export const authStatePath = "e2e/.auth/user.json";

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await use(page);
  },
});

export { expect };
