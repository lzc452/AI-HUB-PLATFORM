import { randomBytes } from "node:crypto";
import { assertCsrfRequest, readCookieValue } from "./csrf.js";
import { ReplayGuard, type ReplayNonceStore } from "./replay-guard.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface RequestLike {
  method: string;
  url?: string;
  headers: Record<string, string | undefined>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): ResponseLike;
  json(body: unknown): unknown;
}

export interface ProductionSecurityOptions {
  expectedOrigin: string;
  replayStore: ReplayNonceStore;
  enabled: boolean;
}

function setCsrfCookie(response: ResponseLike, request: RequestLike): void {
  if (readCookieValue(request.headers.cookie, "csrf_token") !== undefined)
    return;
  response.setHeader(
    "set-cookie",
    `csrf_token=${randomBytes(24).toString("base64url")}; Path=/; SameSite=Strict; Secure`,
  );
}

export function createProductionSecurityMiddleware(
  options: ProductionSecurityOptions,
) {
  const replayGuard = new ReplayGuard(options.replayStore);
  return (request: RequestLike, response: ResponseLike, next: () => void) => {
    if (!options.enabled) {
      next();
      return;
    }
    setCsrfCookie(response, request);
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
      next();
      return;
    }

    try {
      assertCsrfRequest({
        method: request.method,
        expectedOrigin: options.expectedOrigin,
        headers: request.headers,
      });
    } catch (error) {
      response.status(403).json({
        code: error instanceof Error ? error.message : "CSRF_REJECTED",
      });
      return;
    }

    const nonce = request.headers["x-request-nonce"];
    const timestamp = request.headers["x-request-timestamp"];
    if (nonce === undefined || timestamp === undefined) {
      response.status(409).json({ code: "REPLAY_HEADERS_REQUIRED" });
      return;
    }

    void replayGuard
      .assertFresh({
        nonce,
        timestamp,
        actorEmployeeId: "authenticated-request",
        route: (request.url ?? "/").split("?", 1)[0]!,
      })
      .then(() => next())
      .catch((error: unknown) => {
        response.status(409).json({
          code: error instanceof Error ? error.message : "REPLAY_REJECTED",
        });
      });
  };
}
