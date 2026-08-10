import type { ChallengeResponse, EncryptedLoginEnvelope } from "@ai-hub/contracts";

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate an AES-256-GCM key for encrypting the login payload.
 */
async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
  ]);
}

/**
 * Build an encrypted login envelope for transmission to the server.
 *
 * 1. Generates an AES-256-GCM key
 * 2. Encrypts the login payload (JSON) with AES-GCM
 * 3. Wraps the AES key with the server's RSA-OAEP public key
 * 4. Returns the complete envelope
 */
export async function buildLoginEnvelope(
  employeeId: string,
  password: string,
  challenge: ChallengeResponse,
): Promise<EncryptedLoginEnvelope> {
  const aesKey = await generateAesKey();

  // Import server's RSA public key from JWK.
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    challenge.jwk as unknown as JsonWebKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );

  // AAD = SHA-256(keyId + nonce) — binds envelope to this specific challenge.
  const aadInput = challenge.keyId + challenge.nonce;
  const aadHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(aadInput),
  );
  const aad = base64urlFromBuffer(aadHash);
  // Decode the base64url AAD to raw bytes for the additionalData parameter.
  const aadBytes = new Uint8Array(aadHash);

  // Encrypt the login payload.
  const plaintext = JSON.stringify({
    employeeId,
    password,
    deviceLabel: "browser",
  });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    aesKey,
    new TextEncoder().encode(plaintext),
  );

  // Wrap the AES key with RSA-OAEP.
  const wrappedKey = await crypto.subtle.wrapKey(
    "raw",
    aesKey,
    rsaKey,
    { name: "RSA-OAEP" },
  );

  return {
    encryptedPayload: base64urlFromBuffer(ciphertext as ArrayBuffer),
    wrappedKey: base64urlFromBuffer(wrappedKey as ArrayBuffer),
    iv: base64urlFromBuffer(iv.buffer as ArrayBuffer),
    aad,
    keyId: challenge.keyId,
    nonce: challenge.nonce,
  };
}
