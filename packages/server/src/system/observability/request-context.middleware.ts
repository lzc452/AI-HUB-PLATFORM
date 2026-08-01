import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable } from "@nestjs/common";
import { isValid, ulid } from "ulid";

import type { HttpMetricLabels } from "./metrics.js";
import { OBSERVABILITY_METRICS } from "./tokens.js";

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
        route: (request.originalUrl ?? request.url ?? "unknown").split(
          "?",
          1,
        )[0]!,
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
