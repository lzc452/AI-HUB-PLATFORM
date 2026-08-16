import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type {
  SignatureSignerPort,
  SignatureVerifierPort,
} from "./storage.port.js";

/** 本地/生产均使用明确 key material 的 Ed25519 signer/verifier。 */
export class Ed25519ArtifactSigner
  implements SignatureSignerPort, SignatureVerifierPort
{
  private readonly privateKey;
  private readonly publicKey;

  constructor(input: { privateKeyPem?: string; publicKeyPem: string }) {
    this.publicKey = createPublicKey(input.publicKeyPem);
    this.privateKey =
      input.privateKeyPem === undefined
        ? undefined
        : createPrivateKey(input.privateKeyPem);
  }

  async sign(content: Uint8Array): Promise<string> {
    if (this.privateKey === undefined)
      throw new Error("ARTIFACT_SIGNER_UNAVAILABLE");
    return sign(null, Buffer.from(content), this.privateKey).toString(
      "base64url",
    );
  }

  async verify(content: Uint8Array, signature: string): Promise<boolean> {
    if (signature.length === 0) return false;
    try {
      return verify(
        null,
        Buffer.from(content),
        this.publicKey,
        Buffer.from(signature, "base64url"),
      );
    } catch {
      return false;
    }
  }
}
