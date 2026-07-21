import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WEBAUTHN_RP_ID: z.string().min(1).default("localhost"),
  WEBAUTHN_RP_NAME: z.string().min(1).default("Schedule App"),
  WEBAUTHN_ORIGIN: z.url().default("http://localhost:3001"),
  SECRET_KEY: z.string().min(1).default("dev_secret_key_please_change"),
  ACCESS_TOKEN_EXPIRES_IN: z.coerce.number().int().positive().default(5),
  REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().int().positive().default(7),
  ALGORITHM: z.literal("HS256").default("HS256"),
});

export const env = envSchema.parse(process.env);
