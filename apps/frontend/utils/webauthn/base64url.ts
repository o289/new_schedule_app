/**
 * base64url string → Uint8Array
 * @param {string} base64url
 * @returns {Uint8Array}
 */
export function base64urlToUint8Array(base64url: string): Uint8Array {
  if (typeof base64url !== "string" || base64url.length === 0) {
    throw new Error("Invalid base64url input");
  }

  // URL-safe → standard base64
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if necessary
  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }

  // Decode base64 string
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

/**
 * Uint8Array → base64url string
 * @param {Uint8Array} uint8Array
 * @returns {string}
 */
export function uint8ArrayToBase64url(uint8Array: Uint8Array): string {
  if (!(uint8Array instanceof Uint8Array)) {
    throw new Error("Input must be a Uint8Array");
  }

  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]!);
  }

  // Standard base64
  let base64 = btoa(binaryString);

  // Convert to URL-safe base64
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
