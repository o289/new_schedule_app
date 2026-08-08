import { defineConfig, devices } from "@playwright/test";

import { getE2EEnvironment } from "./e2e/environment";
import { authStatePath } from "./e2e/fixtures/auth";

const environment = getE2EEnvironment();

const backendEnvironment = {
  DATABASE_URL: environment.databaseUrl,
  E2E_DATABASE_URL: environment.databaseUrl,
  WEBAUTHN_RP_ID: environment.webauthnRpId,
  WEBAUTHN_RP_NAME: environment.webauthnRpName,
  WEBAUTHN_ORIGIN: environment.webauthnOrigin,
  SECRET_KEY: environment.secretKey,
  ACCESS_TOKEN_EXPIRES_IN: environment.accessTokenExpiresIn,
  REFRESH_TOKEN_EXPIRES_IN: environment.refreshTokenExpiresIn,
  ALGORITHM: environment.algorithm,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: environment.webauthnOrigin,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /mobile\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath,
      },
    },
    {
      name: "chromium-mobile",
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        storageState: authStatePath,
      },
    },
  ],
  webServer: [
    {
      name: "backend",
      command: "pnpm e2e:backend",
      url: `${environment.apiUrl}/ping`,
      reuseExistingServer: false,
      env: { ...backendEnvironment, PORT: "8100" },
    },
    {
      name: "frontend",
      command: "pnpm exec vite --config vite.config.ts --port 3101",
      url: environment.webauthnOrigin,
      reuseExistingServer: false,
      env: {
        VITE_API_URL: environment.apiUrl,
      },
    },
  ],
});
