export interface ObjectStoragePort {
  put(key: string, content: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ReadableObjectStoragePort extends ObjectStoragePort {
  openReadStream(key: string): Promise<NodeJS.ReadableStream | null>;
  putStream(key: string, stream: NodeJS.ReadableStream): Promise<number>;
}

export interface MalwareScannerPort {
  scan(content: Uint8Array): Promise<"clean" | "infected">;
}

export interface SignatureVerifierPort {
  verify(content: Uint8Array, signature: string): Promise<boolean>;
}

export interface ArtifactVerificationResult {
  accepted: boolean;
  scanStatus: "passed" | "failed";
  sha256: string;
  reason?:
    | "DIGEST_MISMATCH"
    | "MALWARE_DETECTED"
    | "INVALID_SIGNATURE"
    | "ARTIFACT_NOT_FOUND"
    | "ARTIFACT_NOT_VERIFIED"
    | "ARTIFACT_SECURITY_UNAVAILABLE";
}

export interface ArtifactVerificationPort {
  verifyArtifact(input: {
    artifactKey: string;
    expectedSha256: string;
    signature: string;
  }): Promise<ArtifactVerificationResult>;
}
