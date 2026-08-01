import { describe, expect, it } from "vitest";

import { startWorkerMetricsServer } from "./metrics-server.js";

describe("startWorkerMetricsServer", () => {
  it("serves metrics only from the internal metrics path", async () => {
    const listener = await startWorkerMetricsServer(
      { metricsText: async () => "ai_hub_worker_handler_failures_total 1\n" },
      0,
    );

    try {
      const metrics = await fetch(
        `http://127.0.0.1:${listener.port}/internal/metrics`,
      );
      const missing = await fetch(`http://127.0.0.1:${listener.port}/`);

      expect(metrics.status).toBe(200);
      expect(await metrics.text()).toContain(
        "ai_hub_worker_handler_failures_total",
      );
      expect(missing.status).toBe(404);
    } finally {
      await listener.close();
    }
  });
});
