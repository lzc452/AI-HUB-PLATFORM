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
  /**
   * 续租：handler 执行期间刷新 lease，避免超时被他人重领并重复执行副作用。
   *
   * **可选**：未实现时 worker 自动跳过心跳（退化为无续租语义）。
   * 实现方**返回 false 而非抛错**——心跳失败意味着「已失去该事件」，
   * 是一个需要调用方知晓的常规结果，不是异常。
   */
  heartbeat?(id: string, claim: OutboxClaim): Promise<boolean>;
  complete(id: string, claim: OutboxClaim): Promise<void>;
  fail(
    id: string,
    claim: OutboxClaim,
    errorCode: string,
    nextAvailableAt: Date,
  ): Promise<void>;
  quarantine(id: string, claim: OutboxClaim, reasonCode: string): Promise<void>;
}
