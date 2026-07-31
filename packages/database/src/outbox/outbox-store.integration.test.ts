import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { sql } from "kysely";
import { createDatabase, runMigrations } from "../index.js";
import { OutboxStore } from "./outbox-store.js";

function createSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("OutboxStore", () => {
  let db: ReturnType<typeof createDatabase> | undefined;
  let stop: (() => Promise<void>) | undefined;
  let store: OutboxStore;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    store = new OutboxStore(db);
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("claims and completes an event only once", async () => {
    await store.append({
      eventType: "system.probe.requested",
      aggregateType: "system",
      aggregateId: "probe",
      payload: { source: "test" },
      idempotencyKey: "probe-1",
    });

    const first = await store.claim(10, "worker-a");
    const second = await store.claim(10, "worker-b");

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(first[0]?.idempotencyKey).toBe("probe-1");

    await store.complete(first[0]!.id);
    expect(await store.claim(10, "worker-c")).toHaveLength(0);
  });

  it("returns false without duplicating an idempotency key", async () => {
    const input = {
      eventType: "system.probe.requested",
      aggregateType: "system",
      aggregateId: "idempotency-probe",
      payload: { source: "idempotency-test" },
      idempotencyKey: "duplicate-probe-1",
    };

    expect(await store.append(input)).toBe(true);
    expect(await store.append(input)).toBe(false);

    const claimed = await store.claim(10, "idempotency-worker");
    expect(
      claimed.filter((event) => event.idempotencyKey === "duplicate-probe-1"),
    ).toHaveLength(1);
  });

  it("skips locked rows and records claim ownership in one transaction", async () => {
    await store.append({
      eventType: "system.locked.requested",
      aggregateType: "system",
      aggregateId: "locked",
      payload: { ordinal: 1 },
      idempotencyKey: "claim-lock-a",
    });
    await store.append({
      eventType: "system.available.requested",
      aggregateType: "system",
      aggregateId: "available",
      payload: { ordinal: 2 },
      idempotencyKey: "claim-lock-b",
    });

    const lockHeld = createSignal();
    const releaseLock = createSignal();
    const blockingTransaction = db!
      .transaction()
      .execute(async (transaction) => {
        await transaction
          .selectFrom("outbox_events")
          .select("id")
          .where("idempotency_key", "=", "claim-lock-a")
          .forUpdate()
          .executeTakeFirstOrThrow();
        lockHeld.resolve();
        await releaseLock.promise;
      });

    await lockHeld.promise;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let claimed;
    try {
      claimed = await Promise.race([
        store.claim(10, "worker-skip-locked"),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("CLAIM_BLOCKED_ON_LOCKED_ROW")),
            1_000,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      releaseLock.resolve();
      await blockingTransaction;
    }

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      eventType: "system.available.requested",
      aggregateType: "system",
      aggregateId: "available",
      payload: { ordinal: 2 },
      idempotencyKey: "claim-lock-b",
      attempts: 1,
    });

    const persisted = await db!
      .selectFrom("outbox_events")
      .select(["status", "claimed_by", "claimed_at", "attempts"])
      .where("id", "=", claimed[0]!.id)
      .executeTakeFirstOrThrow();
    expect(persisted.status).toBe("processing");
    expect(persisted.claimed_by).toBe("worker-skip-locked");
    expect(persisted.claimed_at).toBeInstanceOf(Date);
    expect(persisted.attempts).toBe(1);
  });

  it("completes only a processing event and clears its claim", async () => {
    await store.append({
      eventType: "system.complete.requested",
      aggregateType: "system",
      aggregateId: "complete",
      payload: { source: "complete-test" },
      idempotencyKey: "complete-probe-1",
    });
    const claimed = await store.claim(100, "worker-complete");
    const event = claimed.find(
      (candidate) => candidate.idempotencyKey === "complete-probe-1",
    );
    expect(event).toBeDefined();

    await store.complete(event!.id);

    const persisted = await db!
      .selectFrom("outbox_events")
      .select(["status", "completed_at", "claimed_by", "claimed_at"])
      .where("id", "=", event!.id)
      .executeTakeFirstOrThrow();
    expect(persisted.status).toBe("completed");
    expect(persisted.completed_at).toBeInstanceOf(Date);
    expect(persisted.claimed_by).toBeNull();
    expect(persisted.claimed_at).toBeNull();
    await expect(store.complete(event!.id)).rejects.toThrow(
      "OUTBOX_EVENT_NOT_PROCESSING",
    );
  });

  it("reschedules a failed processing event below the attempt limit", async () => {
    await store.append({
      eventType: "system.retry.requested",
      aggregateType: "system",
      aggregateId: "retry",
      payload: { source: "retry-test" },
      idempotencyKey: "retry-probe-1",
    });
    const claimed = await store.claim(100, "worker-retry");
    const event = claimed.find(
      (candidate) => candidate.idempotencyKey === "retry-probe-1",
    );
    expect(event?.attempts).toBe(1);
    const nextAvailableAt = new Date("2030-01-02T03:04:05.000Z");

    await store.fail(event!.id, "TRANSIENT_FAILURE", nextAvailableAt);

    const persisted = await db!
      .selectFrom("outbox_events")
      .select([
        "status",
        "attempts",
        "available_at",
        "claimed_by",
        "claimed_at",
        "last_error",
      ])
      .where("id", "=", event!.id)
      .executeTakeFirstOrThrow();
    expect(persisted.status).toBe("pending");
    expect(persisted.attempts).toBe(1);
    expect(persisted.available_at.toISOString()).toBe(
      "2030-01-02T03:04:05.000Z",
    );
    expect(persisted.claimed_by).toBeNull();
    expect(persisted.claimed_at).toBeNull();
    expect(persisted.last_error).toBe("TRANSIENT_FAILURE");
    await expect(
      store.fail(event!.id, "TRANSIENT_FAILURE", nextAvailableAt),
    ).rejects.toThrow("OUTBOX_EVENT_NOT_PROCESSING");
  });

  it("moves an event to failed when its tenth attempt fails", async () => {
    await store.append({
      eventType: "system.terminal.requested",
      aggregateType: "system",
      aggregateId: "terminal",
      payload: { source: "terminal-test" },
      idempotencyKey: "terminal-probe-1",
    });
    await db!
      .updateTable("outbox_events")
      .set({ attempts: 9 })
      .where("idempotency_key", "=", "terminal-probe-1")
      .execute();
    const claimed = await store.claim(100, "worker-terminal");
    const event = claimed.find(
      (candidate) => candidate.idempotencyKey === "terminal-probe-1",
    );
    expect(event?.attempts).toBe(10);

    await store.fail(
      event!.id,
      "TERMINAL_FAILURE",
      new Date("2031-01-02T03:04:05.000Z"),
    );

    const persisted = await db!
      .selectFrom("outbox_events")
      .select(["status", "attempts", "claimed_by", "claimed_at", "last_error"])
      .where("id", "=", event!.id)
      .executeTakeFirstOrThrow();
    expect(persisted).toEqual({
      status: "failed",
      attempts: 10,
      claimed_by: null,
      claimed_at: null,
      last_error: "TERMINAL_FAILURE",
    });
    expect(
      (await store.claim(100, "worker-after-terminal")).some(
        (candidate) => candidate.id === event!.id,
      ),
    ).toBe(false);
  });

  it.each([
    {
      idempotencyKey: "sanitize-url-probe",
      errorCode: "postgresql://admin:super-secret@db.internal/ai_hub",
    },
    {
      idempotencyKey: "sanitize-length-probe",
      errorCode: "A".repeat(65),
    },
  ])(
    "stores only a bounded safe code for $idempotencyKey",
    async ({ idempotencyKey, errorCode }) => {
      await store.append({
        eventType: "system.sanitize.requested",
        aggregateType: "system",
        aggregateId: idempotencyKey,
        payload: { source: "sanitize-test" },
        idempotencyKey,
      });
      const claimed = await store.claim(100, "worker-sanitize");
      const event = claimed.find(
        (candidate) => candidate.idempotencyKey === idempotencyKey,
      );

      await store.fail(
        event!.id,
        errorCode,
        new Date("2032-01-02T03:04:05.000Z"),
      );

      const persisted = await db!
        .selectFrom("outbox_events")
        .select("last_error")
        .where("id", "=", event!.id)
        .executeTakeFirstOrThrow();
      expect(persisted.last_error).toBe("UNCLASSIFIED_ERROR");
    },
  );

  it("installs the claim index in scheduling order", async () => {
    const indexes = await sql<{ indexdef: string }>`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'outbox_events'
        and indexname = 'outbox_events_claim_idx'
    `.execute(db!);
    expect(indexes.rows).toHaveLength(1);
    expect(indexes.rows[0]?.indexdef).toContain(
      "(status, available_at, created_at)",
    );
  });

  it("rejects an outbox status outside the declared state machine", async () => {
    await expect(
      sql`
        insert into outbox_events (
          event_type,
          aggregate_type,
          aggregate_id,
          payload,
          idempotency_key,
          status
        ) values (
          'system.invalid.requested',
          'system',
          'invalid',
          '{}'::jsonb,
          'invalid-status-probe',
          'unknown'
        )
      `.execute(db!),
    ).rejects.toThrow(/outbox_events_status_check/u);
  });
});
