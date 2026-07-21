import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "../../core/api-error";

const serviceMocks = vi.hoisted(() => ({
  registerOptions: vi.fn(),
  registerVerify: vi.fn(),
  loginOptions: vi.fn(),
  loginVerify: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("./service", () => ({
  AuthService: class {
    registerOptions = serviceMocks.registerOptions;
    registerVerify = serviceMocks.registerVerify;
    loginOptions = serviceMocks.loginOptions;
    loginVerify = serviceMocks.loginVerify;
    refresh = serviceMocks.refresh;
    logout = serviceMocks.logout;
  },
}));

vi.mock("../user/repository", () => ({
  UserRepository: class {
    getById = vi.fn();
  },
}));

vi.mock("../../core/security", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("../../core/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));

import { app } from "../../app";

const registrationCredential = {
  id: "credential-id",
  rawId: "credential-id",
  type: "public-key",
  response: {
    clientDataJSON: "client-data",
    attestationObject: "attestation",
  },
};

const authenticationCredential = {
  id: "credential-id",
  rawId: "credential-id",
  type: "public-key",
  response: {
    clientDataJSON: "client-data",
    authenticatorData: "authenticator-data",
    signature: "signature",
  },
};

async function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /auth/passkey/register/options", async () => {
    const result = { data: { publicKey: { challenge: "challenge" } } };
    serviceMocks.registerOptions.mockResolvedValue(result);

    const response = await post("/auth/passkey/register/options", {
      email: "test@example.com",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(serviceMocks.registerOptions).toHaveBeenCalledWith({
      email: "test@example.com",
    });
  });

  it("POST /auth/passkey/register/verify", async () => {
    serviceMocks.registerVerify.mockResolvedValue({ data: null });

    const response = await post(
      "/auth/passkey/register/verify",
      registrationCredential,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: null });
    expect(serviceMocks.registerVerify).toHaveBeenCalledWith(
      registrationCredential,
    );
  });

  it("POST /auth/passkey/login/options", async () => {
    const result = { data: { publicKey: { challenge: "challenge" } } };
    serviceMocks.loginOptions.mockResolvedValue(result);

    const response = await post("/auth/passkey/login/options", {
      email: "test@example.com",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("POST /auth/passkey/login/verify", async () => {
    const result = {
      data: { access_token: "access", refresh_token: "refresh" },
    };
    serviceMocks.loginVerify.mockResolvedValue(result);

    const response = await post(
      "/auth/passkey/login/verify",
      authenticationCredential,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(serviceMocks.loginVerify).toHaveBeenCalledWith(
      authenticationCredential,
    );
  });

  it("不正なリクエストを400にする", async () => {
    const response = await post("/auth/passkey/register/options", {
      email: "invalid-email",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_REQUEST",
    });
    expect(serviceMocks.registerOptions).not.toHaveBeenCalled();
  });

  it("Serviceのエラーコードを返す", async () => {
    serviceMocks.loginOptions.mockRejectedValue(
      new BadRequestError("PASSKEY_NOT_FOUND"),
    );

    const response = await post("/auth/passkey/login/options", {
      email: "missing@example.com",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "PASSKEY_NOT_FOUND",
    });
  });
});
