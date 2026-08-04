import { timingSafeEqual } from "node:crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfRequestLike {
  method: string;
  expectedOrigin: string;
  headers: Record<string, string | undefined>;
}

function cookieValue(
  cookie: string | undefined,
  name: string,
): string | undefined {
  if (cookie === undefined) return undefined;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || undefined;
  }
  return undefined;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function assertCsrfRequest(request: CsrfRequestLike): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  if (request.headers.origin !== request.expectedOrigin) {
    throw new Error("CSRF_ORIGIN_REQUIRED");
  }

  const cookieToken = cookieValue(request.headers.cookie, "csrf_token");
  const headerToken = request.headers["x-csrf-token"];
  if (
    cookieToken === undefined ||
    headerToken === undefined ||
    !constantTimeEqual(cookieToken, headerToken)
  ) {
    throw new Error("CSRF_TOKEN_INVALID");
  }
}

export function readCookieValue(
  cookie: string | undefined,
  name: string,
): string | undefined {
  return cookieValue(cookie, name);
}
