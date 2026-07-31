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

export interface OutboxStorePort {
  append(input: OutboxEventInput): Promise<boolean>;
  claim(
    limit: number,
    workerId: string,
  ): Promise<readonly ClaimedOutboxEvent[]>;
  complete(id: string): Promise<void>;
  fail(id: string, errorCode: string, nextAvailableAt: Date): Promise<void>;
}
