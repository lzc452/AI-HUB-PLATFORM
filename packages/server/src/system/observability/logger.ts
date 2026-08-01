import type { LoggerService } from "@nestjs/common";
import { pino, type Logger } from "pino";
import { pinoHttp } from "pino-http";

import { normalizeTraceId } from "./request-context.middleware.js";

const SENSITIVE_KEY =
  /authorization|cookie|password|secret|token|database_?url/i;
const CONNECTION_STRING = /\b(?:postgres(?:ql)?):\/\/[^\s"'<>]+/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s"'<>]+/gi;
const SECRET_ASSIGNMENT =
  /\b(password|secret|token|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi;

function sanitizeString(value: string): string {
  return value
    .replace(CONNECTION_STRING, "[Redacted]")
    .replace(BEARER_TOKEN, "Bearer [Redacted]")
    .replace(SECRET_ASSIGNMENT, "$1=[Redacted]");
}

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[Redacted]" : sanitize(item, seen),
    ]),
  );
}

export function sanitizeLogValue(value: unknown): unknown {
  return sanitize(value, new WeakSet());
}

export function createApplicationLogger(
  level: "debug" | "info" | "warn" | "error",
): Logger {
  return pino({
    level,
    base: { service: process.env.npm_package_name ?? "ai-hub" },
    redact: {
      paths: [
        "authorization",
        "cookie",
        "password",
        "secret",
        "token",
        "databaseUrl",
        "database_url",
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
      ],
      censor: "[Redacted]",
    },
  });
}

export function createHttpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (request, response) => {
      const supplied = request.headers["x-request-id"];
      const traceId = normalizeTraceId(
        Array.isArray(supplied) ? supplied[0] : supplied,
      );
      request.headers["x-request-id"] = traceId;
      response.setHeader("x-request-id", traceId);
      return traceId;
    },
    customProps: (request) => ({ traceId: request.id }),
    serializers: {
      req: (request) => ({
        id: request.id,
        method: request.method,
        url: request.url?.split("?", 1)[0],
      }),
      res: (response) => ({ statusCode: response.statusCode }),
      err: (error) => ({ name: error.name }),
    },
    customSuccessMessage: () => "request completed",
    customErrorMessage: () => "request failed",
  });
}

export class PinoNestLogger implements LoggerService {
  public constructor(private readonly logger: Logger) {}

  public log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", message, optionalParams);
  }

  public error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  public warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  public debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  public setLogLevels(): void {}

  private write(
    level: "debug" | "info" | "warn" | "error",
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const safeMessage = sanitizeLogValue(message);
    const text = typeof safeMessage === "string" ? safeMessage : "Nest event";
    this.logger[level](
      { data: safeMessage, params: sanitizeLogValue(optionalParams) },
      text,
    );
  }
}
