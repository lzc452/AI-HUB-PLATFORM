import type { ActorContext, EmployeeId } from "./identity.js";

/** Available login methods. */
export type LoginMethod = "password" | "dingtalk_sso";

/** Response from GET /internal/identity/login/options */
export interface LoginOptions {
  methods: readonly LoginMethod[];
}

/** A JSON Web Key representing an RSA public key for login encryption. */
export interface JwkPublicKey {
  kty: "RSA";
  n: string;
  e: string;
  alg: "RSA-OAEP-256";
  key_ops: readonly ["wrapKey"];
}

/** Response from GET /internal/identity/login/challenge */
export interface ChallengeResponse {
  keyId: string;
  jwk: JwkPublicKey;
  nonce: string;
  expiresAt: string;
}

/** Encrypted login payload envelope (browser → server). */
export interface EncryptedLoginEnvelope {
  /** AES-256-GCM encrypted payload (base64url). */
  encryptedPayload: string;
  /** RSA-OAEP-256 wrapped AES key (base64url). */
  wrappedKey: string;
  /** AES-GCM initialization vector (base64url). */
  iv: string;
  /** AES-GCM additional authenticated data (base64url). */
  aad: string;
  /** Key identifier from the challenge response. */
  keyId: string;
  /** Nonce from the challenge response. */
  nonce: string;
}

/** Request body for POST /internal/identity/login/password */
export interface PasswordLoginRequest {
  employeeId: EmployeeId;
  envelope: EncryptedLoginEnvelope;
  deviceLabel?: string;
}

/** Session record returned in login responses. */
export interface LoginSession {
  sessionId: string;
  employeeId: EmployeeId;
  deviceLabel: string;
  expiresAt: string;
  revokedAt: string | null;
}

/** Response for successful password or SSO login. */
export interface LoginResponse {
  actor: ActorContext;
  session: LoginSession;
}

// ── DingTalk SSO types ──────────────────────────────────────────

/** Response from GET /internal/identity/login/dingtalk/start */
export interface DingTalkSsoStartResponse {
  redirectUrl: string;
}

/** Request body for POST /internal/identity/login/dingtalk/complete */
export interface DingTalkSsoCompleteRequest {
  handoffToken: string;
}

// ── Error code constants ────────────────────────────────────────

/** Login encryption error codes. */
export const LOGIN_ERROR_CODES = {
  /** Challenge has expired (older than 5 minutes). */
  CHALLENGE_EXPIRED: "LOGIN_CHALLENGE_EXPIRED",
  /** Envelope structure is invalid or missing required fields. */
  ENCRYPTION_INVALID_ENVELOPE: "LOGIN_ENCRYPTION_INVALID_ENVELOPE",
  /** Decryption failed — tampered ciphertext, wrong key, or AAD mismatch. */
  ENCRYPTION_DECRYPTION_FAILED: "LOGIN_ENCRYPTION_DECRYPTION_FAILED",
  /** Request body contains a plaintext password field. */
  PLAINTEXT_REJECTED: "LOGIN_PLAINTEXT_REJECTED",
  /** Challenge nonce has already been consumed (replay). */
  REPLAY_DETECTED: "LOGIN_REPLAY_DETECTED",
  /** The requested login method is not available. */
  METHOD_UNAVAILABLE: "LOGIN_METHOD_UNAVAILABLE",
} as const;

/** DingTalk SSO error codes. */
export const DINGTALK_SSO_ERROR_CODES = {
  /** DingTalk SSO is disabled in configuration. */
  SSO_DISABLED: "DINGTALK_SSO_DISABLED",
  /** OAuth state parameter is invalid or expired. */
  STATE_INVALID: "DINGTALK_SSO_STATE_INVALID",
  /** Failed to exchange authorization code for access token. */
  CODE_EXCHANGE_FAILED: "DINGTALK_SSO_CODE_EXCHANGE_FAILED",
  /** No local employee matched the DingTalk employee number. */
  USER_NOT_FOUND: "DINGTALK_SSO_USER_NOT_FOUND",
  /** DingTalk user ID is already bound to a different employee. */
  ALREADY_BOUND: "DINGTALK_SSO_ALREADY_BOUND",
  /** DingTalk organization (corpId) does not match configuration. */
  WRONG_CORP: "DINGTALK_SSO_WRONG_CORP",
  /** The matched employee account is disabled or archived. */
  ACCOUNT_DISABLED: "DINGTALK_SSO_ACCOUNT_DISABLED",
} as const;
