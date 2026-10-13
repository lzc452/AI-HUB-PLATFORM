import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable } from "@nestjs/common";
import { isValid, ulid } from "ulid";

import type { HttpMetricLabels } from "./metrics.js";
import { OBSERVABILITY_METRICS } from "./tokens.js";
import { normalizeRouteLabel } from "./route-normalizer.js";

const TRACE_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const requestContext = new AsyncLocalStorage<{ traceId: string }>();

export interface HttpMetricsTracker {
  trackHttpRequest(): (labels: HttpMetricLabels) => void;
}

interface RequestLike {
  headers: Record<string, string | readonly string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  /**
   * Express 在路由匹配完成后填入的路由对象，`path` 是形如
   * `/api/applications/:applicationId` 的模板——比原始 URL 更适合做指标标签。
   * 声明为可选：中层与单测用的鸭子类型请求对象上没有它。
   */
  route?: { path?: unknown };
}

interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  once(event: string, listener: () => void): unknown;
}

export function normalizeTraceId(value: unknown): string {
  return typeof value === "string" &&
    TRACE_ID_PATTERN.test(value) &&
    isValid(value)
    ? value
    : ulid();
}

export function getTraceId(): string {
  return requestContext.getStore()?.traceId ?? ulid();
}

@Injectable()
export class RequestContextMiddleware {
  public constructor(
    @Inject(OBSERVABILITY_METRICS)
    private readonly metrics: HttpMetricsTracker,
  ) {}

  public use(
    request: RequestLike,
    response: ResponseLike,
    next: () => void,
  ): void {
    const supplied = request.headers["x-request-id"];
    const traceId = normalizeTraceId(
      Array.isArray(supplied) ? supplied[0] : supplied,
    );
    const finish = this.metrics.trackHttpRequest();
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      finish({
        method: request.method ?? "UNKNOWN",
        // route 必须归一化：原始 URL 里的 uuid/自增 id/日期串是无限取值，
        // 直接当Prometheus 标签会让时间序列无界增长（见 route-normalizer）。
        route: normalizeRouteLabel(
          request.originalUrl ?? request.url,
          typeof request.route?.path === "string" ? request.route.path : undefined,
        ),
        statusCode: response.statusCode,
      });
    };

    request.headers["x-request-id"] = traceId;
    response.setHeader("x-request-id", traceId);
    response.once("finish", record);
    response.once("close", record);
    requestContext.run({ traceId }, next);
  }
}
