import { createHash, randomBytes } from "node:crypto";

import type { Base64URLString } from "@simplewebauthn/server";

import type { ChallengeCreate } from "#schemas/challenge";
import type { PasskeyCreate } from "#schemas/passkey";
import { avatarKeySchema } from "#schemas/user";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "#backend/core/api-error";
import {
  createAccessToken,
  createRefreshToken,
  refreshTokenLifetimeMilliseconds,
} from "#backend/core/security";
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "#backend/core/webauthn";
import { db } from "#backend/database/client";
import type { Database } from "#backend/database/repository";
import { ChallengeRepository } from "../challenge/repository";
import { AuthSessionRepository } from "../auth-session/repository";
import { PasskeyRepository } from "../passkey/repository";
import { UserRepository } from "../user/repository";
import type {
  PasskeyLoginOptionsRequest,
  PasskeyLoginOptionsResponse,
  PasskeyLoginVerifyRequest,
  PasskeyRegisterOptionsRequest,
  PasskeyRegisterOptionsResponse,
  PasskeyRegisterVerifyRequest,
  PasskeyRegisterVerifyResponse,
  TokenResponse,
} from "#schemas/auth";

const challengeLifetimeMilliseconds = 5 * 60 * 1000;
const provisionalUserName = "新しいユーザー";

function challengeFingerprint(challenge: string): string {
  return createHash("sha256").update(challenge).digest("hex").slice(0, 12);
}

function logPasskeyAuth(
  level: "info" | "warn",
  event: string,
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "test") return;

  console[level](
    JSON.stringify({
      scope: "passkey-auth",
      event,
      ...details,
    }),
  );
}

function readClientDataChallenge(encodedClientData: string): string {
  try {
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
  } catch {
    logPasskeyAuth("warn", "challenge.client_data_invalid", {
      encodedLength: encodedClientData.length,
    });
    throw new BadRequestError("AUTH_INVALID_CHALLENGE");
  }
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly passkeyRepository: PasskeyRepository;
  private readonly challengeRepository: ChallengeRepository;
  private readonly authSessionRepository: AuthSessionRepository;

  constructor(private readonly database: Database = db) {
    this.userRepository = new UserRepository(database);
    this.passkeyRepository = new PasskeyRepository(database);
    this.challengeRepository = new ChallengeRepository(database);
    this.authSessionRepository = new AuthSessionRepository(database);
  }

  async registerOptions(
    payload: PasskeyRegisterOptionsRequest,
  ): Promise<PasskeyRegisterOptionsResponse> {
    const email = payload.email.trim().toLowerCase();
    const name = payload.name.trim();
    const existingUser = await this.userRepository.getByEmail(email);
    const user =
      existingUser ??
      (await this.userRepository.createUser(email, provisionalUserName));

    const existingPasskeys = await this.passkeyRepository.getByUser(user.id);
    if (existingPasskeys.length > 0) {
      throw new ConflictError("PASSKEY_ALREADY_REGISTERED");
    }
    const canConfirmProfile =
      existingPasskeys.length === 0 && user.name === provisionalUserName;
    const excludeCredentials = existingPasskeys.map((passkey) => ({
      id: passkey.credentialId as Base64URLString,
    }));

    const publicKey = await createRegistrationOptions({
      userId: user.id,
      email,
      challenge: Uint8Array.from(randomBytes(32)),
      excludeCredentials,
    });

    const challengeInput: ChallengeCreate = {
      userId: user.id,
      challenge: publicKey.challenge,
      type: "register",
      registrationName: canConfirmProfile ? name : null,
      registrationAvatar: canConfirmProfile ? payload.avatar : null,
      expiresAt: new Date(
        Date.now() + challengeLifetimeMilliseconds,
      ).toISOString(),
    };

    await this.challengeRepository.create(challengeInput);

    logPasskeyAuth("info", "register.options_issued", {
      userId: user.id,
      challengeFingerprint: challengeFingerprint(publicKey.challenge),
      expiresAt: challengeInput.expiresAt,
    });

    return { data: { publicKey } };
  }

  async registerVerify(
    payload: PasskeyRegisterVerifyRequest,
  ): Promise<PasskeyRegisterVerifyResponse> {
    const existing = await this.passkeyRepository.getByCredentialId(payload.id);
    if (existing) {
      throw new ConflictError("PASSKEY_ALREADY_REGISTERED");
    }

    const receivedChallenge = readClientDataChallenge(
      payload.response.clientDataJSON,
    );
    const receivedFingerprint = challengeFingerprint(receivedChallenge);

    logPasskeyAuth("info", "register.verify_received", {
      credentialIdFingerprint: challengeFingerprint(payload.id),
      challengeFingerprint: receivedFingerprint,
    });

    const challenge =
      await this.challengeRepository.getByChallenge(receivedChallenge);

    if (!challenge) {
      logPasskeyAuth("warn", "register.challenge_not_found", {
        challengeFingerprint: receivedFingerprint,
      });
      throw new BadRequestError("AUTH_INVALID_CHALLENGE");
    }

    if (challenge.type !== "register") {
      logPasskeyAuth("warn", "register.challenge_wrong_type", {
        userId: challenge.userId,
        challengeFingerprint: receivedFingerprint,
        actualType: challenge.type,
      });
      throw new BadRequestError("AUTH_INVALID_CHALLENGE");
    }

    let challengeDeleted = false;

    try {
      if (challenge.expiresAt.getTime() < Date.now()) {
        logPasskeyAuth("warn", "register.challenge_expired", {
          userId: challenge.userId,
          challengeFingerprint: receivedFingerprint,
          expiresAt: challenge.expiresAt.toISOString(),
        });
        throw new BadRequestError("AUTH_INVALID_CHALLENGE");
      }

      const verification = await verifyRegistration({
        credential: payload,
        expectedChallenge: challenge.challenge,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new BadRequestError("PASSKEY_VERIFICATION_FAILED");
      }

      const passkeyInput: PasskeyCreate = {
        userId: challenge.userId,
        credentialId: payload.id,
        publicKey: Buffer.from(
          verification.registrationInfo.credential.publicKey,
        ).toString("base64url"),
        signCount: verification.registrationInfo.credential.counter,
        transports: null,
      };

      await this.database.transaction(async (transaction) => {
        const passkeyRepository = new PasskeyRepository(transaction);
        const userRepository = new UserRepository(transaction);
        const challengeRepository = new ChallengeRepository(transaction);

        await passkeyRepository.create(passkeyInput);

        if (typeof challenge.registrationName === "string") {
          await userRepository.updateProfile(challenge.userId, {
            name: challenge.registrationName,
            avatar:
              challenge.registrationAvatar === null
                ? null
                : avatarKeySchema.parse(challenge.registrationAvatar),
          });
        }

        await challengeRepository.deleteById(challenge.id);
      });
      challengeDeleted = true;
      logPasskeyAuth("info", "register.verify_succeeded", {
        userId: challenge.userId,
        challengeFingerprint: receivedFingerprint,
      });
      return { data: null };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new BadRequestError("PASSKEY_VERIFICATION_FAILED");
    } finally {
      if (!challengeDeleted) {
        await this.challengeRepository.deleteById(challenge.id);
      }
      logPasskeyAuth("info", "register.challenge_deleted", {
        userId: challenge.userId,
        challengeFingerprint: receivedFingerprint,
      });
    }
  }

  async loginOptions(
    payload: PasskeyLoginOptionsRequest,
  ): Promise<PasskeyLoginOptionsResponse> {
    const email = payload.email.trim().toLowerCase();
    const user = await this.userRepository.getByEmail(email);
    if (!user) {
      throw new BadRequestError("PASSKEY_NOT_FOUND");
    }

    const passkeys = await this.passkeyRepository.getByUser(user.id);
    if (passkeys.length === 0) {
      throw new BadRequestError("PASSKEY_NOT_FOUND");
    }

    const allowCredentials = passkeys.map((passkey) => ({
      id: passkey.credentialId as Base64URLString,
    }));

    const publicKey = await createAuthenticationOptions({
      challenge: Uint8Array.from(randomBytes(32)),
      allowCredentials,
    });
    const challengeInput: ChallengeCreate = {
      userId: user.id,
      challenge: publicKey.challenge,
      type: "login",
      registrationName: null,
      registrationAvatar: null,
      expiresAt: new Date(
        Date.now() + challengeLifetimeMilliseconds,
      ).toISOString(),
    };

    await this.challengeRepository.create(challengeInput);
    logPasskeyAuth("info", "login.options_issued", {
      userId: user.id,
      challengeFingerprint: challengeFingerprint(publicKey.challenge),
      expiresAt: challengeInput.expiresAt,
    });

    return { data: { publicKey } };
  }

  async loginVerify(
    payload: PasskeyLoginVerifyRequest,
  ): Promise<TokenResponse> {
    const passkey = await this.passkeyRepository.getByCredentialId(payload.id);
    if (!passkey) {
      throw new BadRequestError("PASSKEY_NOT_FOUND");
    }

    const receivedChallenge = readClientDataChallenge(
      payload.response.clientDataJSON,
    );
    const challenge =
      await this.challengeRepository.getByChallenge(receivedChallenge);
    if (!challenge || challenge.type !== "login") {
      throw new BadRequestError("AUTH_INVALID_CHALLENGE");
    }

    try {
      if (challenge.expiresAt.getTime() < Date.now()) {
        throw new BadRequestError("AUTH_INVALID_CHALLENGE");
      }

      const verification = await verifyAuthentication({
        credential: payload,
        expectedChallenge: challenge.challenge,
        credentialPublicKey: Uint8Array.from(
          Buffer.from(passkey.publicKey, "base64url"),
        ),
        credentialCurrentSignCount: passkey.signCount,
      });

      if (!verification.verified) {
        throw new BadRequestError("PASSKEY_VERIFICATION_FAILED");
      }

      await this.passkeyRepository.updateSignCount(
        passkey.id,
        verification.authenticationInfo.newCounter,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new BadRequestError("PASSKEY_VERIFICATION_FAILED");
    } finally {
      await this.challengeRepository.deleteById(challenge.id);
    }

    const refreshToken = createRefreshToken();
    const session = await this.authSessionRepository.create({
      userId: passkey.userId,
      refreshTokenDigest: createHash("sha256")
        .update(refreshToken)
        .digest("hex"),
      expiresAt: new Date(Date.now() + refreshTokenLifetimeMilliseconds),
    });
    const accessToken = await createAccessToken({
      sub: passkey.userId,
      sid: session.id,
    });

    return {
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    };
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const currentRefreshTokenDigest = createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const session =
      await this.authSessionRepository.getActiveByRefreshTokenDigest(
        currentRefreshTokenDigest,
      );
    if (!session) throw new UnauthorizedError("INVALID_REFRESH_TOKEN");

    const nextRefreshToken = createRefreshToken();
    const rotated = await this.authSessionRepository.rotateRefreshToken(
      session.id,
      currentRefreshTokenDigest,
      createHash("sha256").update(nextRefreshToken).digest("hex"),
      new Date(Date.now() + refreshTokenLifetimeMilliseconds),
    );
    if (!rotated) throw new UnauthorizedError("INVALID_REFRESH_TOKEN");
    const accessToken = await createAccessToken({
      sub: session.userId,
      sid: session.id,
    });

    return {
      data: {
        access_token: accessToken,
        refresh_token: nextRefreshToken,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const session =
      await this.authSessionRepository.getActiveByRefreshTokenDigest(
        createHash("sha256").update(refreshToken).digest("hex"),
      );
    if (!session) throw new UnauthorizedError("INVALID_REFRESH_TOKEN");
    await this.authSessionRepository.revokeById(session.id);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.authSessionRepository.revokeAllByUserId(userId);
  }
}
