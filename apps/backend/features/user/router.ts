import { Hono, type Context } from "hono";
import { z } from "zod";

import { BadRequestError } from "../../core/api-error";
import { requireCurrentUser } from "../../core/current-user";
import { AuthService } from "../auth/service";

const refreshTokenRequestSchema = z.object({
  refresh_token: z.string().min(1),
});

async function readRefreshToken(context: Context): Promise<string> {
  try {
    const payload = refreshTokenRequestSchema.parse(await context.req.json());
    return payload.refresh_token;
  } catch {
    throw new BadRequestError("INVALID_REQUEST");
  }
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
