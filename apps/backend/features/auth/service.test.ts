import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PasskeyLoginVerifyRequest,
  PasskeyRegisterVerifyRequest,
} from "#schemas/auth";

const mocks = vi.hoisted(() => ({
  user: {
    createUser: vi.fn(),
    getByEmail: vi.fn(),
    updateProfile: vi.fn(),
  },
  passkey: {
    create: vi.fn(),
    getByCredentialId: vi.fn(),
    getByUser: vi.fn(),
    updateSignCount: vi.fn(),
  },
  challenge: {
    create: vi.fn(),
    getByChallenge: vi.fn(),
    deleteById: vi.fn(),
  },
  session: {
    create: vi.fn(),
    getActiveByRefreshTokenDigest: vi.fn(),
    rotateRefreshToken: vi.fn(),
    revokeById: vi.fn(),
    revokeAllByUserId: vi.fn(),
  },
  createRegistrationOptions: vi.fn(),
  verifyRegistration: vi.fn(),
  createAuthenticationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
  createAccessToken: vi.fn(),
  createRefreshToken: vi.fn(),
}));

vi.mock("../../database/client", () => ({
  db: { transaction: vi.fn(async (callback) => callback({})) },
}));

vi.mock("../user/repository", () => ({
  UserRepository: class {
    createUser = mocks.user.createUser;
    getByEmail = mocks.user.getByEmail;
    updateProfile = mocks.user.updateProfile;
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
    create = mocks.challenge.create;
    getByChallenge = mocks.challenge.getByChallenge;
    deleteById = mocks.challenge.deleteById;
  },
}));

vi.mock("../auth-session/repository", () => ({
  AuthSessionRepository: class {
    create = mocks.session.create;
    getActiveByRefreshTokenDigest = mocks.session.getActiveByRefreshTokenDigest;
    rotateRefreshToken = mocks.session.rotateRefreshToken;
    revokeById = mocks.session.revokeById;
    revokeAllByUserId = mocks.session.revokeAllByUserId;
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
  refreshTokenLifetimeMilliseconds: 24 * 60 * 60 * 1000,
}));

import { AuthService } from "./service";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@example.com",
  name: "テストユーザー",
  avatar: null,
};

const provisionalUser = { ...user, name: "新しいユーザー" };

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

const registerChallenge = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: user.id,
  challenge: "registration-challenge",
  type: "register" as const,
  registrationName: "テストユーザー",
  registrationAvatar: null,
  expiresAt: new Date(Date.now() + 60_000),
};

const loginChallenge = {
  id: "44444444-4444-4444-8444-444444444444",
  userId: user.id,
  challenge: "login-challenge",
  type: "login" as const,
  registrationName: null,
  registrationAvatar: null,
  expiresAt: new Date(Date.now() + 60_000),
};

const activeSession = {
  id: "55555555-5555-4555-8555-555555555555",
  userId: user.id,
  refreshTokenDigest: "current-digest",
  createdAt: new Date(),
  lastUsedAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
};

function clientDataJSON(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge })).toString("base64url");
}

function registrationPayload(
  challenge = registerChallenge.challenge,
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
      clientDataJSON: clientDataJSON(loginChallenge.challenge),
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
    mocks.challenge.deleteById.mockResolvedValue(true);
  });

  it("registerOptionsで新規ユーザーのChallengeを生成・保存する", async () => {
    mocks.user.getByEmail.mockResolvedValue(null);
    mocks.user.createUser.mockResolvedValue(provisionalUser);
    mocks.passkey.getByUser.mockResolvedValue([]);
    mocks.createRegistrationOptions.mockResolvedValue({
      challenge: "public-key-challenge",
    });

    const result = await new AuthService().registerOptions({
      email: " Test@Example.com ",
      name: " テストユーザー ",
      avatar: "sky",
    });

    expect(mocks.user.createUser).toHaveBeenCalledWith(
      "test@example.com",
      "新しいユーザー",
    );
    expect(mocks.challenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        challenge: "public-key-challenge",
        type: "register",
        registrationName: "テストユーザー",
        registrationAvatar: "sky",
      }),
    );
    expect(result).toEqual({
      data: { publicKey: { challenge: "public-key-challenge" } },
    });
  });

  it("Passkey登録済みユーザーのregisterOptionsを409にする", async () => {
    mocks.user.getByEmail.mockResolvedValue(user);
    mocks.passkey.getByUser.mockResolvedValue([passkey]);

    await expectApiError(
      new AuthService().registerOptions({
        email: user.email,
        name: "上書きされない名前",
        avatar: "sky",
      }),
      409,
      "PASSKEY_ALREADY_REGISTERED",
    );
    expect(mocks.challenge.create).not.toHaveBeenCalled();
  });

  it("registerVerifyで重複credentialを409にする", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(passkey);

    await expectApiError(
      new AuthService().registerVerify(registrationPayload()),
      409,
      "PASSKEY_ALREADY_REGISTERED",
    );
  });

  it("registerVerifyで期限切れChallengeを削除して400にする", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(null);
    mocks.challenge.getByChallenge.mockResolvedValue({
      ...registerChallenge,
      expiresAt: new Date(Date.now() - 1),
    });

    await expectApiError(
      new AuthService().registerVerify(registrationPayload()),
      400,
      "AUTH_INVALID_CHALLENGE",
    );
    expect(mocks.challenge.deleteById).toHaveBeenCalledWith(
      registerChallenge.id,
    );
  });

  it("registerVerifyでPasskeyを保存し対象Challengeだけを削除する", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(null);
    mocks.challenge.getByChallenge.mockResolvedValue(registerChallenge);
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
    expect(mocks.user.updateProfile).toHaveBeenCalledWith(user.id, {
      name: "テストユーザー",
      avatar: null,
    });
    expect(mocks.challenge.deleteById).toHaveBeenCalledWith(
      registerChallenge.id,
    );
  });

  it("loginOptionsで並行利用可能なChallengeを生成・保存する", async () => {
    mocks.user.getByEmail.mockResolvedValue(user);
    mocks.passkey.getByUser.mockResolvedValue([passkey]);
    mocks.createAuthenticationOptions.mockResolvedValue({
      challenge: "public-login-challenge",
    });

    const result = await new AuthService().loginOptions({ email: user.email });

    expect(mocks.challenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        challenge: "public-login-challenge",
        type: "login",
      }),
    );
    expect(mocks.createAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCredentials: [{ id: passkey.credentialId }],
      }),
    );
    expect(result).toEqual({
      data: { publicKey: { challenge: "public-login-challenge" } },
    });
  });

  it("loginVerifyでセッションとトークンを発行し、対象Challengeだけを削除する", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(passkey);
    mocks.challenge.getByChallenge.mockResolvedValue(loginChallenge);
    mocks.verifyAuthentication.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });
    mocks.passkey.updateSignCount.mockResolvedValue({
      ...passkey,
      signCount: 2,
    });
    mocks.createRefreshToken.mockReturnValue("plain-refresh-token");
    mocks.session.create.mockResolvedValue(activeSession);
    mocks.createAccessToken.mockResolvedValue("access-token");

    await expect(
      new AuthService().loginVerify(authenticationPayload()),
    ).resolves.toEqual({
      data: {
        access_token: "access-token",
        refresh_token: "plain-refresh-token",
      },
    });
    expect(mocks.passkey.updateSignCount).toHaveBeenCalledWith(passkey.id, 2);
    expect(mocks.challenge.deleteById).toHaveBeenCalledWith(loginChallenge.id);
    expect(mocks.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        refreshTokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );
    expect(mocks.createAccessToken).toHaveBeenCalledWith({
      sub: user.id,
      sid: activeSession.id,
    });
  });

  it("loginVerifyで期限切れChallengeを削除して400にする", async () => {
    mocks.passkey.getByCredentialId.mockResolvedValue(passkey);
    mocks.challenge.getByChallenge.mockResolvedValue({
      ...loginChallenge,
      expiresAt: new Date(Date.now() - 1),
    });

    await expectApiError(
      new AuthService().loginVerify(authenticationPayload()),
      400,
      "AUTH_INVALID_CHALLENGE",
    );
    expect(mocks.challenge.deleteById).toHaveBeenCalledWith(loginChallenge.id);
  });

  it("refreshでトークンをローテーションする", async () => {
    mocks.session.getActiveByRefreshTokenDigest.mockResolvedValue(
      activeSession,
    );
    mocks.createRefreshToken.mockReturnValue("next-refresh-token");
    mocks.session.rotateRefreshToken.mockResolvedValue(activeSession);
    mocks.createAccessToken.mockResolvedValue("new-access-token");

    await expect(
      new AuthService().refresh("plain-refresh-token"),
    ).resolves.toEqual({
      data: {
        access_token: "new-access-token",
        refresh_token: "next-refresh-token",
      },
    });
    expect(mocks.session.rotateRefreshToken).toHaveBeenCalledWith(
      activeSession.id,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );
    expect(mocks.createAccessToken).toHaveBeenCalledWith({
      sub: user.id,
      sid: activeSession.id,
    });
  });

  it("使用済みまたは不正なrefresh tokenを401にする", async () => {
    mocks.session.getActiveByRefreshTokenDigest.mockResolvedValue(null);

    await expectApiError(
      new AuthService().refresh("invalid"),
      401,
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("ローテーション競合時は401にする", async () => {
    mocks.session.getActiveByRefreshTokenDigest.mockResolvedValue(
      activeSession,
    );
    mocks.createRefreshToken.mockReturnValue("next-refresh-token");
    mocks.session.rotateRefreshToken.mockResolvedValue(null);

    await expectApiError(
      new AuthService().refresh("plain-refresh-token"),
      401,
      "INVALID_REFRESH_TOKEN",
    );
  });

  it("logoutで現在のセッションだけを無効化する", async () => {
    mocks.session.getActiveByRefreshTokenDigest.mockResolvedValue(
      activeSession,
    );
    mocks.session.revokeById.mockResolvedValue(true);

    await expect(
      new AuthService().logout("plain-refresh-token"),
    ).resolves.toBeUndefined();
    expect(mocks.session.revokeById).toHaveBeenCalledWith(activeSession.id);
  });

  it("logoutAllでユーザーの全セッションを無効化する", async () => {
    mocks.session.revokeAllByUserId.mockResolvedValue(2);

    await expect(new AuthService().logoutAll(user.id)).resolves.toBeUndefined();
    expect(mocks.session.revokeAllByUserId).toHaveBeenCalledWith(user.id);
  });
});
