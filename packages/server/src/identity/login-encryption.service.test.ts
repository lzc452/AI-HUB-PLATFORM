import { describe, expect, it, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { LoginEncryptionService } from "./login-encryption.service.js";

// Generate a test RSA-3072 key for the service, then simulate the browser side
// using the same Web Crypto API to verify round-trip interop.

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function bufferFromBase64url(encoded: string): Uint8Array<ArrayBuffer> {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importRsaPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
}

async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
  ]);
}

async function encryptAndWrap(
  plaintext: string,
  challenge: { jwk: JsonWebKey; keyId: string; nonce: string },
): Promise<{
  encryptedPayload: string;
  wrappedKey: string;
  iv: string;
  aad: string;
  keyId: string;
  nonce: string;
}> {
  const aesKey = await generateAesKey();
  const rsaKey = await importRsaPublicKey(challenge.jwk);

  // AAD = SHA-256(keyId + nonce) as a binding value (matches what server expects)
  const aadInput = challenge.keyId + challenge.nonce;
  const aadHash = createHash("sha256").update(aadInput).digest();
  const aad = base64urlFromBuffer(aadHash.buffer as ArrayBuffer);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: bufferFromBase64url(aad) },
    aesKey,
    encoder.encode(plaintext),
  );

  const wrappedKey = await crypto.subtle.wrapKey("raw", aesKey, rsaKey, {
    name: "RSA-OAEP",
  });

  return {
    encryptedPayload: base64urlFromBuffer(ciphertext as ArrayBuffer),
    wrappedKey: base64urlFromBuffer(wrappedKey as ArrayBuffer),
    iv: base64urlFromBuffer(iv.buffer as ArrayBuffer),
    aad,
    keyId: challenge.keyId,
    nonce: challenge.nonce,
  };
}

describe("LoginEncryptionService", () => {
  let service: LoginEncryptionService;

  beforeAll(async () => {
    service = await LoginEncryptionService.generateDev();
  });

  it("creates a challenge with valid JWK and nonce", () => {
    const challenge = service.createChallenge();
    expect(challenge.jwk.kty).toBe("RSA");
    expect(challenge.jwk.alg).toBe("RSA-OAEP-256");
    expect(typeof challenge.jwk.n).toBe("string");
    expect(typeof challenge.jwk.e).toBe("string");
    expect(challenge.keyId).toBeTruthy();
    expect(challenge.nonce).toHaveLength(43); // 32 bytes base64url
    expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(challenge.nonceHash).toBeTruthy();
  });

  it("round-trips: browser encrypt → server decrypt", async () => {
    const challenge = service.createChallenge();
    const plaintext = JSON.stringify({
      employeeId: "E001",
      password: "Correct-123",
      deviceLabel: "browser",
    });

    const envelope = await encryptAndWrap(plaintext, {
      jwk: challenge.jwk as unknown as JsonWebKey,
      keyId: challenge.keyId,
      nonce: challenge.nonce,
    });

    const result = await service.decryptEnvelope(envelope, challenge.nonce);
    expect(result).toEqual({
      employeeId: "E001",
      password: "Correct-123",
      deviceLabel: "browser",
    });
  });

  it("rejects tampered ciphertext", async () => {
    const challenge = service.createChallenge();
    const envelope = await encryptAndWrap(
      JSON.stringify({ employeeId: "E001", password: "p", deviceLabel: "b" }),
      {
        jwk: challenge.jwk as unknown as JsonWebKey,
        keyId: challenge.keyId,
        nonce: challenge.nonce,
      },
    );

    const tampered = {
      ...envelope,
      encryptedPayload: envelope.encryptedPayload + "X",
    };
    await expect(
      service.decryptEnvelope(tampered, challenge.nonce),
    ).rejects.toThrow("LOGIN_ENCRYPTION_DECRYPTION_FAILED");
  });

  it("rejects tampered AAD", async () => {
    const challenge = service.createChallenge();
    const envelope = await encryptAndWrap(
      JSON.stringify({ employeeId: "E001", password: "p", deviceLabel: "b" }),
      {
        jwk: challenge.jwk as unknown as JsonWebKey,
        keyId: challenge.keyId,
        nonce: challenge.nonce,
      },
    );

    const tampered = { ...envelope, aad: envelope.aad + "X" };
    await expect(
      service.decryptEnvelope(tampered, challenge.nonce),
    ).rejects.toThrow("LOGIN_ENCRYPTION_DECRYPTION_FAILED");
  });

  it("rejects wrong keyId", async () => {
    const challenge = service.createChallenge();
    const envelope = await encryptAndWrap(
      JSON.stringify({ employeeId: "E001", password: "p", deviceLabel: "b" }),
      {
        jwk: challenge.jwk as unknown as JsonWebKey,
        keyId: challenge.keyId,
        nonce: challenge.nonce,
      },
    );

    const tampered = { ...envelope, keyId: "wrong-key-id" };
    await expect(
      service.decryptEnvelope(tampered, challenge.nonce),
    ).rejects.toThrow("LOGIN_ENCRYPTION_INVALID_ENVELOPE");
  });

  it("rejects wrong nonce in envelope", async () => {
    const challenge = service.createChallenge();
    const envelope = await encryptAndWrap(
      JSON.stringify({ employeeId: "E001", password: "p", deviceLabel: "b" }),
      {
        jwk: challenge.jwk as unknown as JsonWebKey,
        keyId: challenge.keyId,
        nonce: challenge.nonce,
      },
    );

    await expect(
      service.decryptEnvelope(envelope, "wrong-nonce-value"),
    ).rejects.toThrow("LOGIN_CHALLENGE_EXPIRED");
  });
});
