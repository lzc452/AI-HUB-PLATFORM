import { describe, expect, it } from "vitest";

import { ObservabilityMetrics } from "./metrics.js";

describe("ObservabilityMetrics", () => {
  it("exports HTTP, readiness, outbox, and worker metrics", async () => {
    const metrics = new ObservabilityMetrics({
      collectOutboxCounts: async () => ({
        pending: 2,
        processing: 1,
        failed: 3,
      }),
    });
    const finish = metrics.trackHttpRequest();

    finish({ method: "GET", route: "/internal/health/live", statusCode: 200 });
    metrics.recordDatabaseReadiness(false);
    metrics.recordWorkerHandler("system.probe.requested", 0.25, "failed");

    const output = await metrics.metricsText();

    expect(output).toContain("ai_hub_http_request_duration_seconds");
    expect(output).toContain("ai_hub_http_active_requests 0");
    expect(output).toContain("ai_hub_database_ready 0");
    expect(output).toContain('ai_hub_outbox_events{status="pending"} 2');
    expect(output).toContain("ai_hub_worker_handler_duration_seconds");
    expect(output).toContain("ai_hub_worker_handler_failures_total");
  });
});
