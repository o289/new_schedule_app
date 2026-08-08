import { resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { getE2EEnvironment } from "./environment";

const environment = getE2EEnvironment();

if (process.env.DATABASE_URL !== environment.databaseUrl) {
  throw new Error("DATABASE_URL must equal E2E_DATABASE_URL when starting E2E");
}

process.env.WEBAUTHN_RP_ID = environment.webauthnRpId;
process.env.WEBAUTHN_RP_NAME = environment.webauthnRpName;
process.env.WEBAUTHN_ORIGIN = environment.webauthnOrigin;
process.env.SECRET_KEY = environment.secretKey;
process.env.ACCESS_TOKEN_EXPIRES_IN = environment.accessTokenExpiresIn;
process.env.REFRESH_TOKEN_EXPIRES_IN = environment.refreshTokenExpiresIn;
process.env.ALGORITHM = environment.algorithm;

const { db } = await import("../apps/backend/database/client");

await migrate(db as never, {
  migrationsFolder: resolve(import.meta.dirname, "../drizzle"),
});

await import("../apps/backend/index");
