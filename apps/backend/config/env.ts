import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WEBAUTHN_RP_ID: z.string().min(1, "WEBAUTHN_RP_ID is required"),
  WEBAUTHN_RP_NAME: z.string().min(1, "WEBAUTHN_RP_NAME is required"),
  WEBAUTHN_ORIGIN: z.url("WEBAUTHN_ORIGIN must be a URL"),
  SECRET_KEY: z.string().min(1, "SECRET_KEY is required"),
  ACCESS_TOKEN_EXPIRES_IN: z.coerce
    .number()
    .int()
    .positive("ACCESS_TOKEN_EXPIRES_IN is required"),
  REFRESH_TOKEN_EXPIRES_IN: z.coerce
    .number()
    .int()
    .positive("REFRESH_TOKEN_EXPIRES_IN is required"),
  ALGORITHM: z.literal("HS256", "ALGORITHM must be HS256"),
});

export const env = envSchema.parse(process.env);
