import { Hono, type Context } from "hono";

import { refreshTokenRequestSchema } from "#schemas/auth";
import { publicUserProfileSchema } from "#schemas/user";
import { BadRequestError, ValidationError } from "#backend/core/api-error";
import { requireCurrentUser } from "#backend/core/current-user";
import { parseJsonBody } from "#backend/core/request";
import { AuthService } from "../auth/service";
import { UserRepository } from "./repository";

async function readRefreshToken(context: Context): Promise<string> {
  const payload = await parseJsonBody(
    context,
    refreshTokenRequestSchema,
    () => new BadRequestError("INVALID_REQUEST"),
  );

  return payload.refresh_token;
}

export const userRouter = new Hono().basePath("/auth");

userRouter.post("/refresh", async (context) => {
  const refreshToken = await readRefreshToken(context);
  const response = await new AuthService().refresh(refreshToken);

  return context.json(response, 200);
});

userRouter.post("/logout", async (context) => {
  const refreshToken = await readRefreshToken(context);
  await new AuthService().logout(refreshToken);

  return context.body(null, 204);
});

userRouter.get("/me", async (context) => {
  const user = await requireCurrentUser(context);

  return context.json(
    { email: user.email, name: user.name, avatar: user.avatar },
    200,
  );
});

userRouter.put("/me", async (context) => {
  const user = await requireCurrentUser(context);
  const profile = await parseJsonBody(
    context,
    publicUserProfileSchema,
    () => new ValidationError("VALIDATION_ERROR"),
  );
  const updatedUser = await new UserRepository().updateProfile(
    user.id,
    profile,
  );

  if (!updatedUser) {
    throw new BadRequestError("HTTP_ERROR");
  }

  return context.json(
    {
      email: updatedUser.email,
      name: updatedUser.name,
      avatar: updatedUser.avatar,
    },
    200,
  );
});
