import { z } from "zod";

export const envSchema = z
  .object({
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
    EMAIL_PROVIDER: z.enum(["fake", "brevo"]).default("fake"),
    BREVO_API_KEY: z.string().min(1).optional(),
    EMAIL_SENDER_NAME: z.string().min(1).optional(),
    EMAIL_SENDER_EMAIL: z.email().optional(),
  })
  .superRefine((value, context) => {
    if (value.EMAIL_PROVIDER !== "brevo") return;

    if (!value.BREVO_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["BREVO_API_KEY"],
        message: "BREVO_API_KEY is required when EMAIL_PROVIDER is brevo",
      });
    }
    if (!value.EMAIL_SENDER_NAME) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_SENDER_NAME"],
        message: "EMAIL_SENDER_NAME is required when EMAIL_PROVIDER is brevo",
      });
    }
    if (!value.EMAIL_SENDER_EMAIL) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_SENDER_EMAIL"],
        message: "EMAIL_SENDER_EMAIL is required when EMAIL_PROVIDER is brevo",
      });
    }
  });

export const env = envSchema.parse(process.env);
