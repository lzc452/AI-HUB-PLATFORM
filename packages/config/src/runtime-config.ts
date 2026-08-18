import { readFileSync } from "node:fs";
import { z } from "zod";

const booleanFromEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

/**
 * 内网 Web 交付 URL 白名单（规格 §11.3）。结构必须与
 * @ai-hub/server 的 `WebTargetPolicy` 保持兼容（apps/api 装配点
 * 仅做结构化赋值，两包互不依赖）。
 */
export interface WebTargetAllowlist {
  protocols: string[];
  allowedHostnames: string[];
  allowedPorts: number[];
  allowedCidrs: string[];
}

/** 默认内网示例策略：仅示例主机名与内网网段放行（fail-closed）。
 * 真实部署必须通过 WEB_TARGET_ALLOWLIST 显式配置实际的内网目标。 */
const DEFAULT_WEB_TARGET_ALLOWLIST: WebTargetAllowlist = {
  protocols: ["http", "https"],
  allowedHostnames: ["apps.internal.example.com", ".corp.example.com"],
  allowedPorts: [80, 443, 8080, 8443],
  allowedCidrs: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
};

const webTargetAllowlistSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "WEB_TARGET_ALLOWLIST must be valid JSON",
      });
      return undefined;
    }
  })
  .pipe(
    z.object({
      protocols: z.array(z.string()).min(1),
      allowedHostnames: z.array(z.string()),
      allowedPorts: z.array(z.number().int().min(1).max(65535)),
      allowedCidrs: z.array(z.string()),
    }),
  )
  .default(DEFAULT_WEB_TARGET_ALLOWLIST);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  COOKIE_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  OUTBOX_LEASE_DURATION_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(15 * 60 * 1000),
  WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
  ARTIFACT_UPLOAD_ENABLED: booleanFromEnv,
  STORAGE_DIRECTORY: z.string().default(".storage/artifacts"),
  ARTIFACT_MAX_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(64 * 1024 * 1024)
    .default(64 * 1024 * 1024),
  OBJECT_STORAGE_DRIVER: z.enum(["disk", "garage"]).default("disk"),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_REGION: z.string().default("garage"),
  OBJECT_STORAGE_BUCKET: z.string().min(1).default("ai-hub"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: booleanFromEnv,
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(100).default(30_000),
  ARTIFACT_SIGNING_PRIVATE_KEY: z.string().optional(),
  ARTIFACT_SIGNING_PUBLIC_KEY: z.string().optional(),
  ENABLE_API_DOCS: booleanFromEnv,
  DEMO_DATA_ENABLED: booleanFromEnv,
  DEMO_MODE: booleanFromEnv,
  LOGIN_ENCRYPTION_PRIVATE_KEY_FILE: z.string().optional(),
  DINGTALK_SSO_ENABLED: z.enum(["true", "false"]).default("false"),
  DINGTALK_CLIENT_ID: z.string().optional(),
  DINGTALK_CLIENT_SECRET_FILE: z.string().optional(),
  DINGTALK_CORP_ID: z.string().optional(),
  DINGTALK_REDIRECT_URI: z.string().optional(),
  WEB_TARGET_ALLOWLIST: webTargetAllowlistSchema,
});

export interface RuntimeConfig {
  nodeEnv: "development" | "test" | "production";
  apiPort: number;
  databaseUrl: string;
  cookieSecret: string;
  logLevel: "debug" | "info" | "warn" | "error";
  outboxPollIntervalMs: number;
  outboxLeaseDurationMs: number;
  workerMetricsPort: number;
  artifactUploadEnabled: boolean;
  storageDirectory: string;
  artifactMaxSizeBytes: number;
  objectStorageDriver: "disk" | "garage";
  objectStorageEndpoint: string | undefined;
  objectStorageRegion: string;
  objectStorageBucket: string;
  objectStorageAccessKey: string | undefined;
  objectStorageSecretKey: string | undefined;
  objectStorageForcePathStyle: boolean;
  clamavHost: string;
  clamavPort: number;
  clamavTimeoutMs: number;
  artifactSigningPrivateKey: string | undefined;
  artifactSigningPublicKey: string | undefined;
  enableApiDocs: boolean;
  demoDataEnabled: boolean;
  demoMode: boolean;
  loginEncryptionPrivateKey: string | undefined;
  dingtalkSsoEnabled: boolean;
  dingtalkClientId: string | undefined;
  dingtalkClientSecret: string | undefined;
  dingtalkCorpId: string | undefined;
  dingtalkRedirectUri: string | undefined;
  webTargetAllowlist: WebTargetAllowlist;
}

function readFileSecret(
  env: NodeJS.ProcessEnv,
  directKey: string,
  fileKey: string,
): string | undefined {
  const direct = env[directKey];
  if (direct !== undefined && direct !== "") {
    return direct;
  }
  const filePath = env[fileKey];
  if (filePath !== undefined) {
    return readFileSync(filePath, "utf8").trim();
  }
  return undefined;
}

export function parseRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const normalizedEnv = {
    ...env,
    DATABASE_URL:
      env.DATABASE_URL ??
      (env.DATABASE_URL_FILE
        ? readFileSync(env.DATABASE_URL_FILE, "utf8").trim()
        : undefined),
    COOKIE_SECRET:
      env.COOKIE_SECRET ??
      (env.COOKIE_SECRET_FILE
        ? readFileSync(env.COOKIE_SECRET_FILE, "utf8").trim()
        : undefined),
  };
  const value = schema.parse(normalizedEnv);

  // Production must provide a login encryption private key.
  if (
    value.NODE_ENV === "production" &&
    value.LOGIN_ENCRYPTION_PRIVATE_KEY_FILE === undefined
  ) {
    throw new Error(
      "LOGIN_ENCRYPTION_PRIVATE_KEY_FILE is required in production",
    );
  }

  if (value.NODE_ENV === "production" && value.ARTIFACT_UPLOAD_ENABLED) {
    if (
      value.OBJECT_STORAGE_DRIVER !== "garage" ||
      value.OBJECT_STORAGE_ENDPOINT === undefined ||
      value.OBJECT_STORAGE_ACCESS_KEY === undefined ||
      value.OBJECT_STORAGE_SECRET_KEY === undefined ||
      value.ARTIFACT_SIGNING_PRIVATE_KEY === undefined ||
      value.ARTIFACT_SIGNING_PUBLIC_KEY === undefined
    ) {
      throw new Error("ARTIFACT_UPLOAD_PRODUCTION_ADAPTER_REQUIRED");
    }
  }

  // DingTalk SSO: if enabled, all required fields must be present.
  const dingtalkSsoEnabled = value.DINGTALK_SSO_ENABLED === "true";
  if (dingtalkSsoEnabled) {
    const missing: string[] = [];
    if (
      value.DINGTALK_CLIENT_ID === undefined ||
      value.DINGTALK_CLIENT_ID === ""
    )
      missing.push("DINGTALK_CLIENT_ID");
    if (
      value.DINGTALK_CLIENT_SECRET_FILE === undefined &&
      env.DINGTALK_CLIENT_SECRET === undefined
    )
      missing.push("DINGTALK_CLIENT_SECRET_FILE or DINGTALK_CLIENT_SECRET");
    if (value.DINGTALK_CORP_ID === undefined || value.DINGTALK_CORP_ID === "")
      missing.push("DINGTALK_CORP_ID");
    if (
      value.DINGTALK_REDIRECT_URI === undefined ||
      value.DINGTALK_REDIRECT_URI === ""
    )
      missing.push("DINGTALK_REDIRECT_URI");
    if (missing.length > 0) {
      throw new Error(
        `DINGTALK_SSO_ENABLED is true but missing: ${missing.join(", ")}`,
      );
    }
  }

  const loginEncryptionPrivateKey =
    value.LOGIN_ENCRYPTION_PRIVATE_KEY_FILE !== undefined
      ? readFileSync(value.LOGIN_ENCRYPTION_PRIVATE_KEY_FILE, "utf8")
      : undefined;

  const dingtalkClientSecret = readFileSecret(
    env,
    "DINGTALK_CLIENT_SECRET",
    "DINGTALK_CLIENT_SECRET_FILE",
  );

  return {
    nodeEnv: value.NODE_ENV,
    apiPort: value.API_PORT,
    databaseUrl: value.DATABASE_URL,
    cookieSecret: value.COOKIE_SECRET,
    logLevel: value.LOG_LEVEL,
    outboxPollIntervalMs: value.OUTBOX_POLL_INTERVAL_MS,
    outboxLeaseDurationMs: value.OUTBOX_LEASE_DURATION_MS,
    workerMetricsPort: value.WORKER_METRICS_PORT,
    artifactUploadEnabled: value.ARTIFACT_UPLOAD_ENABLED,
    storageDirectory: value.STORAGE_DIRECTORY,
    artifactMaxSizeBytes: value.ARTIFACT_MAX_SIZE_BYTES,
    objectStorageDriver: value.OBJECT_STORAGE_DRIVER,
    objectStorageEndpoint: value.OBJECT_STORAGE_ENDPOINT,
    objectStorageRegion: value.OBJECT_STORAGE_REGION,
    objectStorageBucket: value.OBJECT_STORAGE_BUCKET,
    objectStorageAccessKey: value.OBJECT_STORAGE_ACCESS_KEY,
    objectStorageSecretKey: value.OBJECT_STORAGE_SECRET_KEY,
    objectStorageForcePathStyle: value.OBJECT_STORAGE_FORCE_PATH_STYLE,
    clamavHost: value.CLAMAV_HOST,
    clamavPort: value.CLAMAV_PORT,
    clamavTimeoutMs: value.CLAMAV_TIMEOUT_MS,
    artifactSigningPrivateKey: value.ARTIFACT_SIGNING_PRIVATE_KEY,
    artifactSigningPublicKey: value.ARTIFACT_SIGNING_PUBLIC_KEY,
    enableApiDocs: value.ENABLE_API_DOCS,
    demoDataEnabled: value.DEMO_DATA_ENABLED,
    demoMode: value.DEMO_MODE,
    loginEncryptionPrivateKey,
    dingtalkSsoEnabled,
    dingtalkClientId: value.DINGTALK_CLIENT_ID,
    dingtalkClientSecret,
    dingtalkCorpId: value.DINGTALK_CORP_ID,
    dingtalkRedirectUri: value.DINGTALK_REDIRECT_URI,
    webTargetAllowlist: value.WEB_TARGET_ALLOWLIST,
  };
}
