import { Hono, type Context } from "hono";

import { refreshTokenRequestSchema } from "#schemas/auth";
import { BadRequestError } from "../../core/api-error";
import { requireCurrentUser } from "../../core/current-user";
import { parseJsonBody } from "../../core/request";
import { AuthService } from "../auth/service";

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

  return context.json({ email: user.email }, 200);
});
