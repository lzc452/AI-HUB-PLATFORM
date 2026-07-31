import type { ColumnType, Generated } from "kysely";

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  idempotency_key: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  available_at: ColumnType<Date, Date | undefined, Date>;
  claimed_by: string | null;
  claimed_at: Date | null;
  last_error: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  completed_at: Date | null;
}

export interface DatabaseSchema {
  outbox_events: OutboxEventsTable;
}
