import { randomBytes } from "node:crypto";
import { assertCsrfRequest, readCookieValue } from "./csrf.js";
import { ReplayGuard, type ReplayNonceStore } from "./replay-guard.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 以 Bearer API Key 鉴权、因而不适用 Cookie 会话 CSRF / 重放防护的路径前缀。
 *
 * **为什么 `/v1` 必须豁免**——不豁免时该端点在**生产环境**对标准客户端 100% 不可用：
 * 服务端 SDK 不发送 `Origin` 也不带 Cookie，先在 `assertCsrfRequest` 得到 403
 * `CSRF_ORIGIN_REQUIRED`；即使伪造 Origin 补齐 CSRF，也会因缺少 `x-request-nonce` /
 * `x-request-timestamp` 得到 409。而本中间件在非生产环境 `enabled=false`，本地开发与
 * 单元测试**都暴露不出**这个差异，属于「本地通、上线全挂」类型。
 *
 * - CSRF 的威胁模型是「浏览器自动携带环境凭据（Cookie）」。`/v1` 使用调用方显式设置的
 *   `Authorization: Bearer sk-aihub-…`：浏览器不会自动附加该请求头，第三方页面也无法替
 *   用户提供一个用户并不持有的 Key，CSRF 链路不成立。
 * - 重放 nonce 面向「会话 Cookie 驱动的写操作」。要求 OpenAI 客户端额外提供自定义 nonce
 *   头与「接口完全兼容 OpenAI 格式」互斥（PRD G-02）。`/v1` 的滥用与重放风险改由 Key 维度
 *   的 RPM/TPM 限流、日配额，以及逐次调用记账与审计承担。
 * - 本豁免**不削弱**会话端点：`/internal/*` 仍完整执行 Origin + CSRF token + nonce 校验。
 *
 * 修改本清单等同放宽生产安全策略，必须同步安全评审、测试与 PRD 8.3。
 */
export const API_KEY_AUTH_PATH_PREFIXES: readonly string[] = ["/v1"];

/** 去掉查询串后的路径，用于前缀匹配与重放键。 */
function pathOf(request: RequestLike): string {
  return (request.url ?? "/").split("?", 1)[0]!;
}

/** 规整前缀：去空白与尾部斜杠、丢弃空项，避免出现 `//v1` 之类的匹配空洞。 */
function normalizePrefixes(prefixes: readonly string[]): readonly string[] {
  return prefixes
    .map((prefix) => prefix.trim().replace(/\/+$/u, ""))
    .filter((prefix) => prefix.length > 0);
}

/** 前缀**边界**匹配：`/v1` 命中 `/v1` 与 `/v1/...`，但不命中 `/v1-evil`。 */
function isExemptPath(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

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
  /**
   * 豁免 CSRF 与重放校验的路径前缀，默认 `API_KEY_AUTH_PATH_PREFIXES`。
   * 传空数组即关闭豁免；匹配按路径边界进行，`/v1` 不会误放行 `/v1-evil`。
   */
  exemptPathPrefixes?: readonly string[];
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
  const exemptPrefixes = normalizePrefixes(
    options.exemptPathPrefixes ?? API_KEY_AUTH_PATH_PREFIXES,
  );
  return (request: RequestLike, response: ResponseLike, next: () => void) => {
    if (!options.enabled) {
      next();
      return;
    }

    // Bearer API Key 端点不涉及 Cookie 会话：跳过 CSRF/重放校验，同时不下发 csrf_token
    // （该端点没有浏览器会话语义，下发只会给调用方留下无用 Cookie）。
    if (isExemptPath(pathOf(request), exemptPrefixes)) {
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
        route: pathOf(request),
      })
      .then(() => next())
      .catch((error: unknown) => {
        response.status(409).json({
          code: error instanceof Error ? error.message : "REPLAY_REJECTED",
        });
      });
  };
}
