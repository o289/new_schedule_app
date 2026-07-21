import type { Context } from "hono";

import { UnauthorizedError } from "./api-error";
import { verifyAccessToken } from "./security";
import { UserRepository, type User } from "../features/user/repository";

export async function requireCurrentUser(context: Context): Promise<User> {
  const authorization = context.req.header("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new UnauthorizedError("HTTP_ERROR");
  }

  try {
    const payload = await verifyAccessToken(match[1]);
    if (typeof payload.sub !== "string") {
      throw new UnauthorizedError("HTTP_ERROR");
    }

    const user = await new UserRepository().getById(payload.sub);
    if (!user) {
      throw new UnauthorizedError("HTTP_ERROR");
    }

    return user;
  } catch {
    throw new UnauthorizedError("HTTP_ERROR");
  }
}
