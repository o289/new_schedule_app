import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { env } from "../config/env";

type CreateRegistrationOptionsInput = {
  userId: string;
  email: string;
  challenge: Uint8Array<ArrayBuffer>;
  excludeCredentials?: GenerateRegistrationOptionsOpts["excludeCredentials"];
};

export async function createRegistrationOptions({
  userId,
  email,
  challenge,
  excludeCredentials,
}: CreateRegistrationOptionsInput) {
  return generateRegistrationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    userID: new TextEncoder().encode(userId),
    userName: email,
    userDisplayName: email,
    challenge,
    attestationType: "none",
    authenticatorSelection: {
      userVerification: "preferred",
    },
    ...(excludeCredentials ? { excludeCredentials } : {}),
  });
}

type VerifyRegistrationInput = {
  credential: RegistrationResponseJSON;
  expectedChallenge: string;
};

export async function verifyRegistration({
  credential,
  expectedChallenge,
}: VerifyRegistrationInput) {
  return verifyRegistrationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    requireUserVerification: false,
  });
}

type CreateAuthenticationOptionsInput = {
  challenge: Uint8Array<ArrayBuffer>;
  allowCredentials?: GenerateAuthenticationOptionsOpts["allowCredentials"];
};

export async function createAuthenticationOptions({
  challenge,
  allowCredentials,
}: CreateAuthenticationOptionsInput) {
  return generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    challenge,
    userVerification: "preferred",
    ...(allowCredentials ? { allowCredentials } : {}),
  });
}

type VerifyAuthenticationInput = {
  credential: AuthenticationResponseJSON;
  expectedChallenge: string;
  credentialPublicKey: Uint8Array<ArrayBuffer>;
  credentialCurrentSignCount: number;
};

export async function verifyAuthentication({
  credential,
  expectedChallenge,
  credentialPublicKey,
  credentialCurrentSignCount,
}: VerifyAuthenticationInput) {
  return verifyAuthenticationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    credential: {
      id: credential.id,
      publicKey: credentialPublicKey,
      counter: credentialCurrentSignCount,
    },
    requireUserVerification: false,
  });
}
