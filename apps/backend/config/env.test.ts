import { describe, expect, it } from "vitest";

import { envSchema } from "./env";

const baseEnvironment = {
  DATABASE_URL: "postgresql://localhost/app",
  WEBAUTHN_RP_ID: "localhost",
  WEBAUTHN_RP_NAME: "Schedule App Test",
  WEBAUTHN_ORIGIN: "http://localhost:3001",
  SECRET_KEY: "test-secret",
  ACCESS_TOKEN_EXPIRES_IN: "5",
  REFRESH_TOKEN_EXPIRES_IN: "7",
  ALGORITHM: "HS256",
};

describe("email provider environment", () => {
  it("defaults to fake without a Brevo key", () => {
    expect(envSchema.parse(baseEnvironment).EMAIL_PROVIDER).toBe("fake");
  });

  it("rejects an incomplete Brevo configuration", () => {
    expect(() =>
      envSchema.parse({ ...baseEnvironment, EMAIL_PROVIDER: "brevo" }),
    ).toThrow();
  });
});
