import { Hono } from "hono";

import { BadRequestError } from "../../core/api-error";
import { parseJsonBody } from "../../core/request";
import {
  passkeyLoginOptionsRequestSchema,
  passkeyLoginVerifyRequestSchema,
  passkeyRegisterOptionsRequestSchema,
  passkeyRegisterVerifyRequestSchema,
} from "./schema";
import { AuthService } from "./service";

export const authRouter = new Hono().basePath("/auth/passkey");

authRouter.post("/register/options", async (context) => {
  const payload = await parseJsonBody(
    context,
    passkeyRegisterOptionsRequestSchema,
    () => new BadRequestError("INVALID_REQUEST"),
  );
  const response = await new AuthService().registerOptions(payload);

  return context.json(response, 200);
});

authRouter.post("/register/verify", async (context) => {
  const payload = await parseJsonBody(
    context,
    passkeyRegisterVerifyRequestSchema,
    () => new BadRequestError("INVALID_REQUEST"),
  );
  const response = await new AuthService().registerVerify(payload);

  return context.json(response, 200);
});

authRouter.post("/login/options", async (context) => {
  const payload = await parseJsonBody(
    context,
    passkeyLoginOptionsRequestSchema,
    () => new BadRequestError("INVALID_REQUEST"),
  );
  const response = await new AuthService().loginOptions(payload);

  return context.json(response, 200);
});

authRouter.post("/login/verify", async (context) => {
  const payload = await parseJsonBody(
    context,
    passkeyLoginVerifyRequestSchema,
    () => new BadRequestError("INVALID_REQUEST"),
  );
  const response = await new AuthService().loginVerify(payload);

  return context.json(response, 200);
});
