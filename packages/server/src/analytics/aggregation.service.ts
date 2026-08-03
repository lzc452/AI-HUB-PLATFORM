import type {
  AnalyticsAggregationRepository,
  DailyAggregate,
  RawBehaviorEvent,
} from "./aggregation.types.js";
import { metricDefinitions } from "./metric-dictionary.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 180 * DAY_MS;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function uniqueEvents(events: readonly RawBehaviorEvent[]): RawBehaviorEvent[] {
  const byKey = new Map<string, RawBehaviorEvent>();
  for (const event of events) {
    byKey.set(event.idempotencyKey, event);
  }
  return [...byKey.values()];
}

export class AnalyticsAggregationService {
  constructor(private readonly repository: AnalyticsAggregationRepository) {}

  async rebuild(
    fromIso: string,
    toIso: string,
  ): Promise<{ eventCount: number; dayCount: number }> {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const oldestAllowed = new Date(Date.now() - RETENTION_MS);
    const lowerBound = from > oldestAllowed ? from : oldestAllowed;
    const events = uniqueEvents(
      await this.repository.listRawEvents(lowerBound, to),
    ).filter(
      (event) => event.occurredAt >= lowerBound && event.occurredAt < to,
    );
    const rows = new Map<string, DailyAggregate>();

    for (const definition of metricDefinitions) {
      const names = new Set(definition.sourceEventNames);
      for (const event of events) {
        if (!names.has(event.eventName)) {
          continue;
        }
        const day = utcDay(event.occurredAt);
        const key = `${definition.metricKey}|${day}|${event.audienceScopeKey}`;
        const current = rows.get(key);
        if (current === undefined) {
          rows.set(key, {
            metricKey: definition.metricKey,
            day,
            audienceScopeKey: event.audienceScopeKey,
            value: 1,
            sourceEventCount: 1,
          });
        } else {
          current.value += 1;
          current.sourceEventCount += 1;
        }
      }
    }

    const aggregates = [...rows.values()].sort(
      (left, right) =>
        left.metricKey.localeCompare(right.metricKey) ||
        left.day.localeCompare(right.day) ||
        left.audienceScopeKey.localeCompare(right.audienceScopeKey),
    );
    await this.repository.replaceDailyAggregates(aggregates);
    return {
      eventCount: events.length,
      dayCount: new Set(events.map((event) => utcDay(event.occurredAt))).size,
    };
  }
}
