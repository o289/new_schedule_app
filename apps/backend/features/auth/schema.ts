import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import { userEmailSchema } from "../../../../packages/schemas/user";

export const dataResponseSchema = z.object({
  data: z.unknown(),
});

export const passkeyRegisterOptionsRequestSchema = z.object({
  email: userEmailSchema,
});

const credentialBaseShape = {
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z
    .enum(["cross-platform", "platform"])
    .nullable()
    .optional(),
};

const registrationCredentialShape = z.object({
  ...credentialBaseShape,
  response: z.object({
    clientDataJSON: z.string().min(1),
    attestationObject: z.string().min(1),
    transports: z.array(z.string()).optional(),
    publicKeyAlgorithm: z.int().optional(),
    publicKey: z.string().optional(),
    authenticatorData: z.string().optional(),
  }),
});

export const passkeyRegisterVerifyRequestSchema =
  z.custom<RegistrationResponseJSON>(
    (value) => registrationCredentialShape.safeParse(value).success,
    "Invalid passkey registration credential",
  );

export const passkeyRegisterOptionsResponseSchema = z.object({
  data: z.object({
    publicKey: z.custom<PublicKeyCredentialCreationOptionsJSON>(),
  }),
});

export const passkeyRegisterVerifyResponseSchema = z.object({
  data: z.null(),
});

export const passkeyLoginOptionsRequestSchema = z.object({
  email: userEmailSchema,
});

const authenticationCredentialShape = z.object({
  ...credentialBaseShape,
  response: z.object({
    clientDataJSON: z.string().min(1),
    authenticatorData: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().optional(),
  }),
});

export const passkeyLoginVerifyRequestSchema =
  z.custom<AuthenticationResponseJSON>(
    (value) => authenticationCredentialShape.safeParse(value).success,
    "Invalid passkey authentication credential",
  );

export const passkeyLoginOptionsResponseSchema = z.object({
  data: z.object({
    publicKey: z.custom<PublicKeyCredentialRequestOptionsJSON>(),
  }),
});

export const tokenResponseSchema = z.object({
  data: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
  }),
});

export type DataResponse = z.infer<typeof dataResponseSchema>;
export type PasskeyRegisterOptionsRequest = z.infer<
  typeof passkeyRegisterOptionsRequestSchema
>;
export type PasskeyRegisterVerifyRequest = z.infer<
  typeof passkeyRegisterVerifyRequestSchema
>;
export type PasskeyRegisterOptionsResponse = z.infer<
  typeof passkeyRegisterOptionsResponseSchema
>;
export type PasskeyRegisterVerifyResponse = z.infer<
  typeof passkeyRegisterVerifyResponseSchema
>;
export type PasskeyLoginOptionsRequest = z.infer<
  typeof passkeyLoginOptionsRequestSchema
>;
export type PasskeyLoginVerifyRequest = z.infer<
  typeof passkeyLoginVerifyRequestSchema
>;
export type PasskeyLoginOptionsResponse = z.infer<
  typeof passkeyLoginOptionsResponseSchema
>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
