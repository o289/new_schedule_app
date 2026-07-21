import { jwtVerify, SignJWT, type JWTPayload } from "jose";

import { env } from "../config/env";

const secretKey = new TextEncoder().encode(env.SECRET_KEY);

const secondsPerMinute = 60;
const secondsPerDay = 24 * 60 * 60;

async function createToken(
  data: JWTPayload,
  expiresInSeconds: number,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: env.ALGORITHM, typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresInSeconds)
    .sign(secretKey);
}

export function createAccessToken(
  data: JWTPayload,
  expiresDeltaSeconds = env.ACCESS_TOKEN_EXPIRES_IN * secondsPerMinute,
): Promise<string> {
  return createToken(data, expiresDeltaSeconds);
}

export function createRefreshToken(
  data: JWTPayload,
  expiresDeltaSeconds = env.REFRESH_TOKEN_EXPIRES_IN * secondsPerDay,
): Promise<string> {
  return createToken(data, expiresDeltaSeconds);
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: [env.ALGORITHM],
  });

  return payload;
}
