import { uint8ArrayToBase64url } from "./base64url";

/**
 * Format registration credential for API verify request
 * @param {PublicKeyCredential} credential
 * @returns {object}
 */
export function formatRegistrationCredential(credential: PublicKeyCredential) {
  if (!credential || !credential.response) {
    throw new Error("Invalid registration credential");
  }

  const { id, type, rawId } = credential;
  const response = credential.response as AuthenticatorAttestationResponse;

  return {
    id,
    type,
    rawId: uint8ArrayToBase64url(new Uint8Array(rawId)),
    response: {
      clientDataJSON: uint8ArrayToBase64url(
        new Uint8Array(response.clientDataJSON),
      ),
      attestationObject: uint8ArrayToBase64url(
        new Uint8Array(response.attestationObject),
      ),
    },
  };
}

/**
 * Format authentication credential for API verify request
 * @param {PublicKeyCredential} credential
 * @returns {object}
 */
export function formatAuthenticationCredential(
  credential: PublicKeyCredential,
) {
  if (!credential || !credential.response) {
    throw new Error("Invalid authentication credential");
  }

  const { id, type, rawId } = credential;
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id,
    type,
    rawId: uint8ArrayToBase64url(new Uint8Array(rawId)),
    response: {
      clientDataJSON: uint8ArrayToBase64url(
        new Uint8Array(response.clientDataJSON),
      ),
      authenticatorData: uint8ArrayToBase64url(
        new Uint8Array(response.authenticatorData),
      ),
      signature: uint8ArrayToBase64url(new Uint8Array(response.signature)),
      userHandle: response.userHandle
        ? uint8ArrayToBase64url(new Uint8Array(response.userHandle))
        : null,
    },
  };
}
