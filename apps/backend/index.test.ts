import { resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const webauthnMocks = vi.hoisted(() => ({
  createRegistrationOptions: vi.fn(
    async ({ challenge }: { challenge: Uint8Array }) => ({
      challenge: Buffer.from(challenge).toString("base64url"),
    }),
  ),
  verifyRegistration: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: {
        publicKey: Uint8Array.from([1, 2, 3]),
        counter: 1,
      },
    },
  })),
  createAuthenticationOptions: vi.fn(
    async ({ challenge }: { challenge: Uint8Array }) => ({
      challenge: Buffer.from(challenge).toString("base64url"),
    }),
  ),
  verifyAuthentication: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 2 },
  })),
}));

// 実機の認証器が必要な署名検証だけを置き換え、API・DB・Repositoryは実物を使う。
vi.mock("./core/webauthn", () => webauthnMocks);

function clientDataJSON(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge })).toString("base64url");
}

function readChallengeFromClientData(encodedClientData: string): string {
  const clientData: unknown = JSON.parse(
    Buffer.from(encodedClientData, "base64url").toString("utf8"),
  );

  if (
    typeof clientData !== "object" ||
    clientData === null ||
    !("challenge" in clientData) ||
    typeof clientData.challenge !== "string"
  ) {
    throw new Error("clientDataJSON does not contain a challenge");
  }

  return clientData.challenge;
}

function registrationCredential(challenge: string) {
  return {
    id: "integration-test-credential",
    rawId: "integration-test-credential",
    type: "public-key",
    response: {
      clientDataJSON: clientDataJSON(challenge),
      attestationObject: "test-attestation",
    },
  };
}

function authenticationCredential() {
  return {
    id: "integration-test-credential",
    rawId: "integration-test-credential",
    type: "public-key",
    response: {
      clientDataJSON: clientDataJSON("not-used-by-login-verification"),
      authenticatorData: "test-authenticator-data",
      signature: "test-signature",
    },
  };
}

async function post(app: { request: Function }, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!testDatabaseUrl)("認証API統合テスト", () => {
  let app: { request: Function };
  let db: { execute: Function };
  let closeDatabase: () => Promise<void>;

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    const databaseName = new URL(testDatabaseUrl).pathname;
    if (!databaseName.includes("test")) {
      throw new Error(
        "TEST_DATABASE_URL must point to a database whose name includes 'test'",
      );
    }

    // appを読み込む前に接続先を切り替える。開発DBには接続しない。
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.SECRET_KEY = "integration-test-secret-key";

    const database = await import("./database/client");
    db = database.db;
    closeDatabase = database.closeDatabase;
    await migrate(db as never, {
      migrationsFolder: resolve(import.meta.dirname, "../../drizzle"),
    });

    app = (await import("./app")).app;
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeDatabase?.();
  });

  it("optionsのchallengeとverifyへ送るclientDataJSONのchallengeが一致し、サインアップからログアウトまで完了する", async () => {
    const email = "integration@example.com";

    const registerOptions = await post(app, "/auth/passkey/register/options", {
      email,
    });
    expect(registerOptions.status).toBe(200);
    const registerOptionsBody = await registerOptions.json();
    const registerChallenge = registerOptionsBody.data.publicKey.challenge;
    const registrationRequest = registrationCredential(registerChallenge);

    // ブラウザがverifyへ送る予定の値をデコードし、optionsの値との一致を確認する。
    expect(
      readChallengeFromClientData(registrationRequest.response.clientDataJSON),
    ).toBe(registerChallenge);

    const registerVerify = await post(
      app,
      "/auth/passkey/register/verify",
      registrationRequest,
    );
    expect(registerVerify.status).toBe(200);
    await expect(registerVerify.json()).resolves.toEqual({ data: null });

    const loginOptions = await post(app, "/auth/passkey/login/options", {
      email,
    });
    expect(loginOptions.status).toBe(200);

    const loginVerify = await post(
      app,
      "/auth/passkey/login/verify",
      authenticationCredential(),
    );
    expect(loginVerify.status).toBe(200);
    const tokens = await loginVerify.json();
    expect(tokens.data.access_token).toEqual(expect.any(String));
    expect(tokens.data.refresh_token).toEqual(expect.any(String));

    const me = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${tokens.data.access_token}` },
    });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toEqual({ email });

    const refresh = await post(app, "/auth/refresh", {
      refresh_token: tokens.data.refresh_token,
    });
    expect(refresh.status).toBe(200);

    const logout = await post(app, "/auth/logout", {
      refresh_token: tokens.data.refresh_token,
    });
    expect(logout.status).toBe(204);
  });
});
