export const behaviorEventNames = [
  "application_viewed",
  "application_delivered",
  "application_downloaded",
  "demand_viewed",
  "demand_liked",
  "demand_commented",
  "review_created",
  "review_decided",
  "review_sla_breached",
  "demand_reported",
  "export_requested",
  "assistant_requested",
  "assistant_failed",
  "notification_queued",
  "notification_delivery_retried",
] as const;

export type BehaviorEventName = (typeof behaviorEventNames)[number];
export type AnalyticsAggregateType =
  | "application"
  | "demand"
  | "review"
  | "export"
  | "assistant"
  | "notification";

export interface BehaviorEventInput {
  eventName: string;
  aggregateType: AnalyticsAggregateType;
  aggregateId: string;
  occurredAt: string;
  idempotencyKey: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
  audience?: Readonly<{
    departmentId?: string | null;
    employeeId?: string | null;
  }>;
}

export type BehaviorEventValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "EVENT_NAME_NOT_ALLOWED"
        | "AGGREGATE_ID_REQUIRED"
        | "IDEMPOTENCY_KEY_REQUIRED"
        | "METADATA_VALUE_TOO_LONG"
        | "OCCURRED_AT_INVALID";
    };

export function validateBehaviorEventInput(
  input: BehaviorEventInput,
): BehaviorEventValidation {
  if (!behaviorEventNames.includes(input.eventName as BehaviorEventName)) {
    return { ok: false, reason: "EVENT_NAME_NOT_ALLOWED" };
  }
  if (input.aggregateId.trim().length === 0) {
    return { ok: false, reason: "AGGREGATE_ID_REQUIRED" };
  }
  if (input.idempotencyKey.trim().length === 0) {
    return { ok: false, reason: "IDEMPOTENCY_KEY_REQUIRED" };
  }
  if (Number.isNaN(Date.parse(input.occurredAt))) {
    return { ok: false, reason: "OCCURRED_AT_INVALID" };
  }
  if (
    Object.values(input.metadata).some(
      (value) => typeof value === "string" && value.length > 512,
    )
  ) {
    return { ok: false, reason: "METADATA_VALUE_TOO_LONG" };
  }
  return { ok: true };
}
