import type { EncryptedLoginEnvelope } from "@ai-hub/contracts";
import { createHash, randomBytes } from "node:crypto";

function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function base64urlToBytes(encoded: string): Uint8Array<ArrayBuffer> {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const len = binary.length;
  // Use ArrayBuffer constructor to get a properly typed buffer
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface JwkPublic {
  kty: string;
  n: string;
  e: string;
  alg: string;
  key_ops: readonly string[];
}

export interface ChallengeContext {
  keyId: string;
  jwk: JwkPublic;
  nonce: string;
  nonceHash: string;
  expiresAt: Date;
}

export type { EncryptedLoginEnvelope };

export interface DecryptedLoginPayload {
  employeeId: string;
  password: string;
  deviceLabel: string;
}

export class LoginEncryptionService {
  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly publicJwk: JwkPublic,
    private readonly keyId: string,
  ) {}

  static async generateDev(): Promise<LoginEncryptionService> {
    const keyPair = (await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 3072,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["wrapKey", "unwrapKey"],
    )) as CryptoKeyPair;

    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const publicJwk: JwkPublic = {
      kty: jwk.kty ?? "RSA",
      n: jwk.n ?? "",
      e: jwk.e ?? "",
      alg: "RSA-OAEP-256",
      key_ops: ["wrapKey"],
    };
    const keyId = sha256hex(publicJwk.n).slice(0, 16);

    return new LoginEncryptionService(keyPair.privateKey, publicJwk, keyId);
  }

  static async fromPem(pem: string): Promise<LoginEncryptionService> {
    const der = pemToDer(pem);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      der.buffer as ArrayBuffer,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["unwrapKey"],
    );

    const jwk = await crypto.subtle.exportKey("jwk", privateKey);
    const publicJwk: JwkPublic = {
      kty: jwk.kty ?? "RSA",
      n: jwk.n ?? "",
      e: jwk.e ?? "",
      alg: "RSA-OAEP-256",
      key_ops: ["wrapKey"],
    };
    const keyId = sha256hex(publicJwk.n).slice(0, 16);

    return new LoginEncryptionService(privateKey, publicJwk, keyId);
  }

  createChallenge(): ChallengeContext {
    const nonce = randomBytes(32).toString("base64url");
    const nonceHash = sha256hex(nonce);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    return {
      keyId: this.keyId,
      jwk: this.publicJwk,
      nonce,
      nonceHash,
      expiresAt,
    };
  }

  async decryptEnvelope(
    envelope: EncryptedLoginEnvelope,
    expectedNonce: string,
  ): Promise<DecryptedLoginPayload> {
    if (envelope.nonce !== expectedNonce) {
      throw new Error("LOGIN_CHALLENGE_EXPIRED");
    }

    if (envelope.keyId !== this.keyId) {
      throw new Error("LOGIN_ENCRYPTION_INVALID_ENVELOPE");
    }

    try {
      const wrappedKeyBytes = base64urlToBytes(envelope.wrappedKey);
      const aesKey = await crypto.subtle.unwrapKey(
        "raw",
        wrappedKeyBytes.buffer as ArrayBuffer,
        this.privateKey,
        { name: "RSA-OAEP" },
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );

      const ciphertext = base64urlToBytes(envelope.encryptedPayload);
      const iv = base64urlToBytes(envelope.iv);
      const aad = base64urlToBytes(envelope.aad);

      const plaintextBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        aesKey,
        ciphertext,
      );

      const plaintext = new TextDecoder().decode(plaintextBuffer);
      const parsed = JSON.parse(plaintext) as DecryptedLoginPayload;

      if (
        typeof parsed.employeeId !== "string" ||
        typeof parsed.password !== "string"
      ) {
        throw new Error("LOGIN_ENCRYPTION_INVALID_ENVELOPE");
      }

      return {
        employeeId: parsed.employeeId,
        password: parsed.password,
        deviceLabel: parsed.deviceLabel ?? "browser",
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("LOGIN_")) {
        throw error;
      }
      throw new Error("LOGIN_ENCRYPTION_DECRYPTION_FAILED");
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const lines = pem.split("\n").filter((line) => !line.startsWith("-----"));
  const base64 = lines.join("");
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
