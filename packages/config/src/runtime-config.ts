import { readFileSync } from "node:fs";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  COOKIE_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
});

export interface RuntimeConfig {
  nodeEnv: "development" | "test" | "production";
  apiPort: number;
  databaseUrl: string;
  cookieSecret: string;
  logLevel: "debug" | "info" | "warn" | "error";
  outboxPollIntervalMs: number;
  workerMetricsPort: number;
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
  return {
    nodeEnv: value.NODE_ENV,
    apiPort: value.API_PORT,
    databaseUrl: value.DATABASE_URL,
    cookieSecret: value.COOKIE_SECRET,
    logLevel: value.LOG_LEVEL,
    outboxPollIntervalMs: value.OUTBOX_POLL_INTERVAL_MS,
    workerMetricsPort: value.WORKER_METRICS_PORT,
  };
}
