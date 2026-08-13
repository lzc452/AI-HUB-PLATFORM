import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import { createDatabase } from "@ai-hub/database";

export interface OutboxCounts {
  pending: number;
  processing: number;
  failed: number;
  quarantined: number;
}

export interface ObservabilityMetricsOptions {
  collectOutboxCounts?: () => Promise<OutboxCounts>;
}

export function createOutboxCountCollector(
  databaseUrl: string,
): () => Promise<OutboxCounts> {
  return async () => {
    const database = createDatabase(databaseUrl);
    try {
      const rows = await database
        .selectFrom("outbox_events")
        .select("status")
        .select(({ fn }) => fn.countAll<string>().as("count"))
        .where("status", "in", [
          "pending",
          "processing",
          "failed",
          "quarantined",
        ])
        .groupBy("status")
        .execute();
      const counts: OutboxCounts = {
        pending: 0,
        processing: 0,
        failed: 0,
        quarantined: 0,
      };

      for (const row of rows) {
        if (row.status === "pending") counts.pending = Number(row.count);
        if (row.status === "processing") counts.processing = Number(row.count);
        if (row.status === "failed") counts.failed = Number(row.count);
        if (row.status === "quarantined") {
          counts.quarantined = Number(row.count);
        }
      }
      return counts;
    } finally {
      await database.destroy();
    }
  };
}

export interface HttpMetricLabels {
  method: string;
  route: string;
  statusCode: number;
}

export type WorkerHandlerOutcome = "completed" | "failed" | "quarantined";

export interface WorkerMetricsPort {
  recordWorkerHandler(
    eventType: string,
    durationSeconds: number,
    outcome: WorkerHandlerOutcome,
  ): void;
}

export class ObservabilityMetrics implements WorkerMetricsPort {
  private readonly registry = new Registry();
  private readonly activeRequests: Gauge;
  private readonly httpDuration: Histogram<"method" | "route" | "status_code">;
  private readonly databaseReady: Gauge;
  private readonly outboxEvents: Gauge<"status">;
  private readonly workerDuration: Histogram<"event_type" | "outcome">;
  private readonly workerFailures: Counter<"event_type" | "reason">;

  public constructor(options: ObservabilityMetricsOptions = {}) {
    collectDefaultMetrics({
      prefix: "ai_hub_process_",
      register: this.registry,
    });

    this.activeRequests = new Gauge({
      name: "ai_hub_http_active_requests",
      help: "Number of HTTP requests currently being processed.",
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: "ai_hub_http_request_duration_seconds",
      help: "HTTP request duration in seconds.",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });
    this.databaseReady = new Gauge({
      name: "ai_hub_database_ready",
      help: "Whether the primary database readiness check succeeds.",
      registers: [this.registry],
    });
    this.outboxEvents = new Gauge({
      name: "ai_hub_outbox_events",
      help: "Current number of outbox events by actionable status.",
      labelNames: ["status"],
      registers: [this.registry],
      collect: async () => {
        if (!options.collectOutboxCounts) return;
        const counts = await options.collectOutboxCounts();
        this.outboxEvents.set({ status: "pending" }, counts.pending);
        this.outboxEvents.set({ status: "processing" }, counts.processing);
        this.outboxEvents.set({ status: "failed" }, counts.failed);
        this.outboxEvents.set(
          { status: "quarantined" },
          counts.quarantined,
        );
      },
    });
    this.workerDuration = new Histogram({
      name: "ai_hub_worker_handler_duration_seconds",
      help: "Outbox worker handler duration in seconds.",
      labelNames: ["event_type", "outcome"],
      registers: [this.registry],
    });
    this.workerFailures = new Counter({
      name: "ai_hub_worker_handler_failures_total",
      help: "Total outbox worker handler failures.",
      labelNames: ["event_type", "reason"],
      registers: [this.registry],
    });
  }

  public trackHttpRequest(): (labels: HttpMetricLabels) => void {
    const startedAt = process.hrtime.bigint();
    let finished = false;
    this.activeRequests.inc();

    return (labels) => {
      if (finished) return;
      finished = true;
      this.activeRequests.dec();
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.httpDuration.observe(
        {
          method: labels.method,
          route: labels.route,
          status_code: String(labels.statusCode),
        },
        durationSeconds,
      );
    };
  }

  public recordDatabaseReadiness(ready: boolean): void {
    this.databaseReady.set(ready ? 1 : 0);
  }

  public recordWorkerHandler(
    eventType: string,
    durationSeconds: number,
    outcome: WorkerHandlerOutcome,
  ): void {
    this.workerDuration.observe(
      { event_type: eventType, outcome },
      durationSeconds,
    );
    if (outcome !== "completed") {
      this.workerFailures.inc({ event_type: eventType, reason: outcome });
    }
  }

  public metricsText(): Promise<string> {
    return this.registry.metrics();
  }

  public get contentType(): string {
    return this.registry.contentType;
  }
}
