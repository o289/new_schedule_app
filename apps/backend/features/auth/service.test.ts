import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PasskeyLoginVerifyRequest,
  PasskeyRegisterVerifyRequest,
} from "./schema";

const mocks = vi.hoisted(() => ({
  user: {
    createUser: vi.fn(),
    getById: vi.fn(),
    getByEmail: vi.fn(),
    getByRefreshToken: vi.fn(),
    updateRefreshToken: vi.fn(),
  },
  passkey: {
    create: vi.fn(),
    getByCredentialId: vi.fn(),
    getByUser: vi.fn(),
    updateSignCount: vi.fn(),
  },
  challenge: {
    createOrReplace: vi.fn(),
    getByChallenge: vi.fn(),
    getByUser: vi.fn(),
    deleteByUser: vi.fn(),
  },
  createRegistrationOptions: vi.fn(),
  verifyRegistration: vi.fn(),
  createAuthenticationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
  createAccessToken: vi.fn(),
  createRefreshToken: vi.fn(),
}));

vi.mock("../../database/client", () => ({ db: {} }));

vi.mock("../user/repository", () => ({
  UserRepository: class {
    createUser = mocks.user.createUser;
    getById = mocks.user.getById;
    getByEmail = mocks.user.getByEmail;
    getByRefreshToken = mocks.user.getByRefreshToken;
    updateRefreshToken = mocks.user.updateRefreshToken;
  },
}));

vi.mock("../passkey/repository", () => ({
  PasskeyRepository: class {
    create = mocks.passkey.create;
    getByCredentialId = mocks.passkey.getByCredentialId;
    getByUser = mocks.passkey.getByUser;
    updateSignCount = mocks.passkey.updateSignCount;
  },
}));

vi.mock("../challenge/repository", () => ({
  ChallengeRepository: class {
    createOrReplace = mocks.challenge.createOrReplace;
    getByChallenge = mocks.challenge.getByChallenge;
    getByUser = mocks.challenge.getByUser;
    deleteByUser = mocks.challenge.deleteByUser;
  },
}));

vi.mock("../../core/webauthn", () => ({
  createRegistrationOptions: mocks.createRegistrationOptions,
  verifyRegistration: mocks.verifyRegistration,
  createAuthenticationOptions: mocks.createAuthenticationOptions,
  verifyAuthentication: mocks.verifyAuthentication,
}));

vi.mock("../../core/security", () => ({
  createAccessToken: mocks.createAccessToken,
  createRefreshToken: mocks.createRefreshToken,
}));

import { AuthService } from "./service";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@example.com",
  refreshToken: null,
};

const passkey = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: user.id,
  credentialId: "credential-id",
  publicKey: Buffer.from("stored-public-key").toString("base64url"),
  signCount: 1,
  transports: null,
  createdAt: new Date(),
  lastUsedAt: null,
};

function clientDataJSON(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge })).toString("base64url");
}

function registrationPayload(
  challenge = "registration-challenge",
): PasskeyRegisterVerifyRequest {
  return {
    id: "credential-id",
    rawId: "credential-id",
    type: "public-key",
    response: {
      clientDataJSON: clientDataJSON(challenge),
      attestationObject: "attestation",
    },
  } as PasskeyRegisterVerifyRequest;
}

function authenticationPayload(): PasskeyLoginVerifyRequest {
  return {
    id: passkey.credentialId,
    rawId: passkey.credentialId,
    type: "public-key",
    response: {
      clientDataJSON: clientDataJSON("login-challenge"),
      authenticatorData: "authenticator-data",
      signature: "signature",
    },
  } as PasskeyLoginVerifyRequest;
}

function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string,
) {
  return expect(promise).rejects.toMatchObject({ status, code });
}

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.challenge.deleteByUser.mockResolvedValue(true);
  });

  it("registerOptionsでChallengeを生成・保存する", async () => {
    mocks.user.getByEmail.mockResolvedValue(null);
    mocks.user.createUser.mockResolvedValue(user);
    mocks.passkey.getByUser.mockResolvedValue([]);
    mocks.challenge.createOrReplace.mockResolvedValue({});
    mocks.createRegistrationOptions.mockResolvedValue({
      challenge: "public-key-challenge",
    });

    const before = Date.now();
    const result = await new AuthService().registerOptions({
      email: " Test@Example.com ",
    });

    expect(mocks.user.createUser).toHaveBeenCalledWith("test@example.com");
    expect(mocks.challenge.createOrReplace).toHaveBeenCalledOnce();
    const challengeInput = mocks.challenge.createOrReplace.mock.calls[0]?.[0];
    expect(challengeInput).toMatchObject({
      userId: user.id,
      challenge: "public-key-challenge",
      type: "register",
    });
    expect(Date.parse(challengeInput.expiresAt)).toBeGreaterThanOrEqual(
      before + 5 * 60 * 1000,
    );
    expect(mocks.createRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        email: "test@example.com",
        challenge: expect.any(Uint8Array),
        excludeCredentials: [],
      }),
    );
    expect(
      mocks.createRegistrationOptions.mock.calls[0]?.[0].challenge,
    ).toHaveLength(32);
    expect(result).toEqual({
      data: { publicKey: { challenge: "public-key-challenge" } },
    });
  });

  it("registerVerifyで重複credentialを409にする", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(passkey);

    await expectApiError(
      new AuthService().registerVerify(registrationPayload()),
      409,
      "PASSKEY_ALREADY_REGISTERED",
    );
    expect(mocks.verifyRegistration).not.toHaveBeenCalled();
  });

  it("registerVerifyで不正Challengeを400にする", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(null);
    mocks.challenge.getByChallenge.mockResolvedValue(null);

    await expectApiError(
      new AuthService().registerVerify(registrationPayload()),
      400,
      "AUTH_INVALID_CHALLENGE",
    );
    expect(mocks.passkey.create).not.toHaveBeenCalled();
  });

  it("registerVerifyで期限切れChallengeを削除して400にする", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(null);
    mocks.challenge.getByChallenge.mockResolvedValue({
      userId: user.id,
      challenge: "registration-challenge",
      type: "register",
      expiresAt: new Date(Date.now() - 1),
    });

    await expectApiError(
      new AuthService().registerVerify(registrationPayload()),
      400,
      "AUTH_INVALID_CHALLENGE",
    );
    expect(mocks.challenge.deleteByUser).toHaveBeenCalledWith(user.id);
  });

  it("registerVerifyでPasskeyを保存しtransportsをnullにしてChallengeを削除する", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(null);
    mocks.challenge.getByChallenge.mockResolvedValue({
      userId: user.id,
      challenge: "registration-challenge",
      type: "register",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.verifyRegistration.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          publicKey: Uint8Array.from([1, 2, 3]),
          counter: 4,
        },
      },
    });
    mocks.passkey.create.mockResolvedValue(passkey);

    await expect(
      new AuthService().registerVerify(registrationPayload()),
    ).resolves.toEqual({ data: null });
    expect(mocks.passkey.create).toHaveBeenCalledWith({
      userId: user.id,
      credentialId: "credential-id",
      publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
      signCount: 4,
      transports: null,
    });
    expect(mocks.challenge.deleteByUser).toHaveBeenCalledWith(user.id);
  });

  it("loginOptionsでChallengeを生成・保存する", async () => {
    mocks.user.getByEmail.mockResolvedValue(user);
    mocks.passkey.getByUser.mockResolvedValue([passkey]);
    mocks.challenge.createOrReplace.mockResolvedValue({});
    mocks.createAuthenticationOptions.mockResolvedValue({
      challenge: "public-login-challenge",
    });

    const result = await new AuthService().loginOptions({
      email: user.email,
    });

    expect(mocks.challenge.createOrReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        challenge: "public-login-challenge",
        type: "login",
      }),
    );
    expect(
      mocks.createAuthenticationOptions.mock.calls[0]?.[0].challenge,
    ).toBeInstanceOf(Uint8Array);
    expect(
      mocks.createAuthenticationOptions.mock.calls[0]?.[0].challenge,
    ).toHaveLength(32);
    expect(result).toEqual({
      data: { publicKey: { challenge: "public-login-challenge" } },
    });
  });

  it("loginVerifyでcounter更新・JWT発行・refresh token平文保存・Challenge削除を行う", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(passkey);
    mocks.challenge.getByUser.mockResolvedValue({
      userId: user.id,
      challenge: "login-challenge",
      type: "login",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.verifyAuthentication.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });
    mocks.passkey.updateSignCount.mockResolvedValue({
      ...passkey,
      signCount: 2,
    });
    mocks.createAccessToken.mockResolvedValue("access-token");
    mocks.createRefreshToken.mockResolvedValue("plain-refresh-token");
    mocks.user.getById.mockResolvedValue(user);
    mocks.user.updateRefreshToken.mockResolvedValue({
      ...user,
      refreshToken: "plain-refresh-token",
    });

    const result = await new AuthService().loginVerify(authenticationPayload());

    expect(mocks.passkey.updateSignCount).toHaveBeenCalledWith(passkey.id, 2);
    expect(mocks.challenge.deleteByUser).toHaveBeenCalledWith(user.id);
    expect(mocks.createAccessToken).toHaveBeenCalledWith({ sub: user.id });
    expect(mocks.createRefreshToken).toHaveBeenCalledWith({ sub: user.id });
    expect(mocks.user.updateRefreshToken).toHaveBeenCalledWith(
      user.id,
      "plain-refresh-token",
    );
    expect(result).toEqual({
      data: {
        access_token: "access-token",
        refresh_token: "plain-refresh-token",
      },
    });
  });

  it("loginVerifyで期限切れChallengeを削除して400にする", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(passkey);
    mocks.challenge.getByUser.mockResolvedValue({
      userId: user.id,
      challenge: "login-challenge",
      type: "login",
      expiresAt: new Date(Date.now() - 1),
    });

    await expectApiError(
      new AuthService().loginVerify(authenticationPayload()),
      400,
      "AUTH_INVALID_CHALLENGE",
    );
    expect(mocks.challenge.deleteByUser).toHaveBeenCalledWith(user.id);
    expect(mocks.createAccessToken).not.toHaveBeenCalled();
  });

  it("refreshでaccess tokenを再発行する", async () => {
    mocks.user.getByRefreshToken.mockResolvedValue({
      ...user,
      refreshToken: "plain-refresh-token",
    });
    mocks.createAccessToken.mockResolvedValue("new-access-token");

    await expect(
      new AuthService().refresh("plain-refresh-token"),
    ).resolves.toEqual({
      data: {
        access_token: "new-access-token",
        refresh_token: "plain-refresh-token",
      },
    });
  });

  it.each([
    [null, "INVALID_REFRESH_TOKEN"],
    [{ ...user, refreshToken: null }, "ALREADY_LOGGED_OUT"],
  ])("refresh異常系 %#", async (storedUser, code) => {
    mocks.user.getByRefreshToken.mockResolvedValue(storedUser);

    await expectApiError(new AuthService().refresh("invalid"), 401, code);
  });

  it("logoutでrefresh tokenをnullにする", async () => {
    mocks.user.getByRefreshToken.mockResolvedValue({
      ...user,
      refreshToken: "plain-refresh-token",
    });
    mocks.user.updateRefreshToken.mockResolvedValue({
      ...user,
      refreshToken: null,
    });

    await expect(
      new AuthService().logout("plain-refresh-token"),
    ).resolves.toBeUndefined();
    expect(mocks.user.updateRefreshToken).toHaveBeenCalledWith(user.id, null);
  });

  it.each([
    [null, "INVALID_REFRESH_TOKEN"],
    [{ ...user, refreshToken: null }, "ALREADY_LOGGED_OUT"],
  ])("logout異常系 %#", async (storedUser, code) => {
    mocks.user.getByRefreshToken.mockResolvedValue(storedUser);

    await expectApiError(new AuthService().logout("invalid"), 401, code);
    expect(mocks.user.updateRefreshToken).not.toHaveBeenCalled();
  });
});
