import { base64urlToUint8Array } from "./base64url";

type BackendCredentialDescriptor = Omit<PublicKeyCredentialDescriptor, "id"> & {
  id: string;
};

export interface RegistrationOptions {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  pub_key_cred_params?: PublicKeyCredentialParameters[];
  exclude_credentials?: BackendCredentialDescriptor[];
  authenticator_selection?: Record<string, unknown>;
  hints?: unknown;
  extensions?: unknown;
  [key: string]: unknown;
}

export interface AuthenticationOptions {
  challenge: string;
  allow_credentials?: BackendCredentialDescriptor[];
  user_verification?: UserVerificationRequirement;
  hints?: unknown;
  extensions?: unknown;
  [key: string]: unknown;
}

/**
 * WebAuthn Registration (navigator.credentials.create)
 * @param {PublicKeyCredentialCreationOptions} publicKeyOptions
 * @returns {Promise<PublicKeyCredential>}
 */
export async function startRegistration(
  publicKeyOptions: RegistrationOptions,
): Promise<PublicKeyCredential> {
  if (!window.PublicKeyCredential) {
    throw new Error("WebAuthn is not supported in this browser");
  }

  if (
    !publicKeyOptions ||
    !publicKeyOptions.challenge ||
    !publicKeyOptions.user
  ) {
    throw new Error("Invalid registration options");
  }

  // Deep clone to avoid mutating original object
  const publicKey: Record<string, unknown> = { ...publicKeyOptions };

  // Normalize snake_case fields from backend to camelCase (WebAuthn requires camelCase)

  if (publicKey.pub_key_cred_params) {
    publicKey.pubKeyCredParams = publicKey.pub_key_cred_params;
    delete publicKey.pub_key_cred_params;
  }

  if (publicKey.exclude_credentials) {
    publicKey.excludeCredentials = publicKey.exclude_credentials;
    delete publicKey.exclude_credentials;
  }

  if (publicKey.authenticator_selection) {
    publicKey.authenticatorSelection = publicKey.authenticator_selection;
    delete publicKey.authenticator_selection;
  }

  // Normalize nested authenticatorSelection fields
  if (publicKey.authenticatorSelection) {
    const sel = {
      ...(publicKey.authenticatorSelection as Record<string, unknown>),
    };

    if (sel.authenticator_attachment !== undefined) {
      sel.authenticatorAttachment = sel.authenticator_attachment;
      delete sel.authenticator_attachment;
    }

    if (sel.require_resident_key !== undefined) {
      sel.requireResidentKey = sel.require_resident_key;
      delete sel.require_resident_key;
    }

    if (sel.resident_key !== undefined) {
      sel.residentKey = sel.resident_key;
      delete sel.resident_key;
    }

    if (sel.user_verification !== undefined) {
      sel.userVerification = sel.user_verification;
      delete sel.user_verification;
    }

    publicKey.authenticatorSelection = sel;
  }

  // Decode challenge
  publicKey.challenge = base64urlToUint8Array(publicKeyOptions.challenge);

  // Decode user.id
  publicKey.user = {
    ...(publicKey.user as Record<string, unknown>),
    id: base64urlToUint8Array(publicKeyOptions.user.id),
  };

  // Decode excludeCredentials if exists
  if (publicKey.excludeCredentials) {
    publicKey.excludeCredentials = (
      publicKey.excludeCredentials as BackendCredentialDescriptor[]
    ).map((cred) => ({
      ...cred,
      id: base64urlToUint8Array(cred.id),
    }));
  }

  // Defensive cleanup for nullable/invalid optional fields (WebAuthn is strict)
  if (!Array.isArray(publicKey.hints)) {
    delete publicKey.hints;
  }

  if (
    !publicKey.excludeCredentials ||
    !Array.isArray(publicKey.excludeCredentials)
  ) {
    delete publicKey.excludeCredentials;
  }

  if (publicKey.extensions == null) {
    delete publicKey.extensions;
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKey as unknown as PublicKeyCredentialCreationOptions,
    });
    return credential as PublicKeyCredential;
  } catch (error) {
    throw error;
  }
}

/**
 * WebAuthn Authentication (navigator.credentials.get)
 * @param {PublicKeyCredentialRequestOptions} publicKeyOptions
 * @returns {Promise<PublicKeyCredential>}
 */
export async function startAuthentication(
  publicKeyOptions: AuthenticationOptions,
): Promise<PublicKeyCredential> {
  if (!window.PublicKeyCredential) {
    throw new Error("WebAuthn is not supported in this browser");
  }

  if (!publicKeyOptions || !publicKeyOptions.challenge) {
    throw new Error("Invalid authentication options");
  }

  const publicKey: Record<string, unknown> = { ...publicKeyOptions };

  // Normalize snake_case fields from backend to camelCase

  if (publicKey.allow_credentials) {
    publicKey.allowCredentials = publicKey.allow_credentials;
    delete publicKey.allow_credentials;
  }

  if (publicKey.user_verification !== undefined) {
    publicKey.userVerification = publicKey.user_verification;
    delete publicKey.user_verification;
  }

  // Decode challenge
  publicKey.challenge = base64urlToUint8Array(publicKeyOptions.challenge);

  // Decode allowCredentials if exists
  if (publicKey.allowCredentials) {
    publicKey.allowCredentials = (
      publicKey.allowCredentials as BackendCredentialDescriptor[]
    ).map((cred) => ({
      ...cred,
      id: base64urlToUint8Array(cred.id),
    }));
  }

  // Defensive cleanup for nullable/invalid optional fields
  if (!Array.isArray(publicKey.hints)) {
    delete publicKey.hints;
  }

  if (
    !publicKey.allowCredentials ||
    !Array.isArray(publicKey.allowCredentials)
  ) {
    delete publicKey.allowCredentials;
  }

  if (publicKey.extensions == null) {
    delete publicKey.extensions;
  }

  try {
    const credential = await navigator.credentials.get({
      publicKey: publicKey as unknown as PublicKeyCredentialRequestOptions,
    });
    return credential as PublicKeyCredential;
  } catch (error) {
    throw error;
  }
}
