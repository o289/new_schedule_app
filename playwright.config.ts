import { defineConfig, devices } from "@playwright/test";

import { getE2EEnvironment } from "./e2e/environment";

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
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      name: "backend",
      command: "pnpm e2e:backend",
      url: "http://localhost:8000/ping",
      reuseExistingServer: !process.env.CI,
      env: backendEnvironment,
    },
    {
      name: "frontend",
      command: "pnpm dev:frontend -- --port 3001",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: "http://localhost:8000",
      },
    },
  ],
});
