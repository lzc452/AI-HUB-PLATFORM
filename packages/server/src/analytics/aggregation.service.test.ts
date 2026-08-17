import { describe, expect, it } from "vitest";
import { AnalyticsAggregationService } from "./aggregation.service.js";
import { metricDefinitions } from "./metric-dictionary.js";
import type {
  AnalyticsAggregationRepository,
  DailyAggregate,
  RawBehaviorEvent,
} from "./aggregation.types.js";

const event = (
  idempotencyKey: string,
  occurredAt: string,
  eventName: RawBehaviorEvent["eventName"] = "demand_viewed",
): RawBehaviorEvent => ({
  eventId: idempotencyKey,
  idempotencyKey,
  eventName,
  aggregateId: "demand-1",
  actorEmployeeId: "employee-1",
  occurredAt: new Date(occurredAt),
  audienceScopeKey: "department:department-1",
});

describe("AnalyticsAggregationService", () => {
  it("buckets unique raw events by UTC day and rebuilds identical rows", async () => {
    const saved: DailyAggregate[][] = [];
    const repository: AnalyticsAggregationRepository = {
      listRawEvents: async () => [
        event("one", "2026-08-03T23:59:00.000Z"),
        event("two", "2026-08-04T00:01:00.000Z"),
        event("one", "2026-08-03T23:59:00.000Z"),
      ],
      replaceDailyAggregates: async (rows, from, to) => {
        saved.push([...rows]);
        expect(from).toEqual(new Date("2026-08-03T00:00:00.000Z"));
        expect(to).toEqual(new Date("2026-08-05T00:00:00.000Z"));
      },
    };

    const result = await new AnalyticsAggregationService(repository).rebuild(
      "2026-08-03T00:00:00.000Z",
      "2026-08-05T00:00:00.000Z",
    );
    const second = await new AnalyticsAggregationService(repository).rebuild(
      "2026-08-03T00:00:00.000Z",
      "2026-08-05T00:00:00.000Z",
    );

    expect(result.eventCount).toBe(2);
    expect(result.dayCount).toBe(2);
    expect(saved[0]).toEqual(saved[1]);
    expect(saved[0]).toContainEqual(
      expect.objectContaining({
        metricKey: "innovation.demand_views",
        day: "2026-08-03",
        audienceScopeKey: "department:department-1",
        value: 1,
        sourceEventCount: 1,
      }),
    );
    expect(second).toEqual(result);
  });

  it("does not aggregate events outside the 180-day rebuild window", async () => {
    let saved: readonly DailyAggregate[] = [];
    const repository: AnalyticsAggregationRepository = {
      listRawEvents: async () => [
        event("old", "2026-01-01T00:00:00.000Z"),
        event("inside", "2026-08-03T00:00:00.000Z"),
      ],
      replaceDailyAggregates: async (rows) => {
        saved = rows;
      },
    };

    await new AnalyticsAggregationService(repository).rebuild(
      "2026-08-03T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
    );
    expect(saved.every((row) => row.day === "2026-08-03")).toBe(true);
    expect(
      metricDefinitions.every((definition) => definition.formula.length > 0),
    ).toBe(true);
  });
});
