import { existsSync } from "node:fs";
import { resolve } from "node:path";

const localEnvironmentFile = resolve(import.meta.dirname, "../.env.e2e");

if (existsSync(localEnvironmentFile)) {
  process.loadEnvFile(localEnvironmentFile);
}

export interface E2EEnvironment {
  databaseUrl: string;
  webauthnRpId: string;
  webauthnRpName: string;
  webauthnOrigin: string;
  secretKey: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  algorithm: "HS256";
}

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required. Copy e2e.env.example to .env.e2e before running E2E tests.`,
    );
  }

  return value;
}

export function assertE2EDatabaseUrl(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.slice(1);

  if (!databaseName.includes("e2e") || !databaseName.includes("test")) {
    throw new Error(
      "E2E_DATABASE_URL must point to a database whose name includes both 'e2e' and 'test'",
    );
  }
}

export function getE2EEnvironment(): E2EEnvironment {
  const databaseUrl = required("E2E_DATABASE_URL");
  assertE2EDatabaseUrl(databaseUrl);

  const algorithm = required("E2E_ALGORITHM");

  if (algorithm !== "HS256") {
    throw new Error("E2E_ALGORITHM must be HS256");
  }

  return {
    databaseUrl,
    webauthnRpId: required("E2E_WEBAUTHN_RP_ID"),
    webauthnRpName: required("E2E_WEBAUTHN_RP_NAME"),
    webauthnOrigin: required("E2E_WEBAUTHN_ORIGIN"),
    secretKey: required("E2E_SECRET_KEY"),
    accessTokenExpiresIn: required("E2E_ACCESS_TOKEN_EXPIRES_IN"),
    refreshTokenExpiresIn: required("E2E_REFRESH_TOKEN_EXPIRES_IN"),
    algorithm,
  };
}
