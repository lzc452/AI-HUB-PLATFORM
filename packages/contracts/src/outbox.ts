export interface OutboxEventInput<TPayload = unknown> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  idempotencyKey: string;
}

export interface ClaimedOutboxEvent<TPayload = unknown> {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  idempotencyKey: string;
  attempts: number;
}

export interface OutboxClaim {
  workerId: string;
  attempt: number;
}

export interface OutboxStorePort {
  append(input: OutboxEventInput): Promise<boolean>;
  claim(
    limit: number,
    workerId: string,
  ): Promise<readonly ClaimedOutboxEvent[]>;
  complete(id: string, claim: OutboxClaim): Promise<void>;
  fail(
    id: string,
    claim: OutboxClaim,
    errorCode: string,
    nextAvailableAt: Date,
  ): Promise<void>;
  quarantine(id: string, claim: OutboxClaim, reasonCode: string): Promise<void>;
}
