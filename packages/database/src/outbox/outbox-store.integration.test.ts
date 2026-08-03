import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

  it("uses database time when deciding whether an event is available", async () => {
    await store.append({
      eventType: "system.clock-skew.requested",
      aggregateType: "system",
      aggregateId: "clock-skew",
      payload: { source: "clock-skew-test" },
      idempotencyKey: "clock-skew-probe-1",
    });
    const snapshot = await db!
      .selectFrom("outbox_events")
      .select(["available_at", sql<Date>`now()`.as("database_now")])
      .where("idempotency_key", "=", "clock-skew-probe-1")
      .executeTakeFirstOrThrow();
    const hostCutoff = new Date(snapshot.available_at.getTime() - 60_000);
    expect(snapshot.available_at.getTime()).toBeLessThanOrEqual(
      snapshot.database_now.getTime(),
    );

    vi.useFakeTimers({ now: hostCutoff });
    let claimed: Awaited<ReturnType<OutboxStore["claim"]>>;
    try {
      claimed = await store.claim(100, "worker-clock-skew");
    } finally {
      vi.useRealTimers();
    }

    expect(
      claimed.some(
        (candidate) => candidate.idempotencyKey === "clock-skew-probe-1",
      ),
      JSON.stringify({
        availableAt: snapshot.available_at.toISOString(),
        hostCutoff: hostCutoff.toISOString(),
        databaseNow: snapshot.database_now.toISOString(),
        claimedKeys: claimed.map((candidate) => candidate.idempotencyKey),
      }),
    ).toBe(true);
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

  it("creates the Phase 2 identity tables including reset challenges", async () => {
    const result = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'departments',
          'employees',
          'department_memberships',
          'roles',
          'employee_roles',
          'user_sessions',
          'password_reset_challenges',
          'dingtalk_bindings',
          'dingtalk_sync_runs',
          'identity_audit_events'
        )
    `.execute(db!);

    expect(result.rows.map((row) => row.table_name).sort()).toEqual([
      "department_memberships",
      "departments",
      "dingtalk_bindings",
      "dingtalk_sync_runs",
      "employee_roles",
      "employees",
      "identity_audit_events",
      "password_reset_challenges",
      "roles",
      "user_sessions",
    ]);
  });

  it("creates the Phase 3 application delivery and review schema", async () => {
    const tables = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'applications',
          'application_versions',
          'application_deliveries',
          'application_reviews',
          'application_review_queue',
          'application_audit_events'
        )
    `.execute(db!);

    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "application_audit_events",
      "application_deliveries",
      "application_review_queue",
      "application_reviews",
      "application_versions",
      "applications",
    ]);

    const columns = await sql<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>`
      select table_name, column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name in (
          'applications',
          'application_versions',
          'application_deliveries',
          'application_reviews',
          'application_review_queue',
          'application_audit_events'
        )
        and column_name in (
          'tenant_id',
          'maintainer_employee_id',
          'department_id',
          'artifact_sha256',
          'artifact_signature',
          'reviewer_employee_id',
          'application_owner_employee_id'
        )
      order by table_name, column_name
    `.execute(db!);

    expect(columns.rows.some((row) => row.column_name === "tenant_id")).toBe(
      false,
    );
    expect(columns.rows).toEqual([
      {
        table_name: "application_reviews",
        column_name: "application_owner_employee_id",
        is_nullable: "NO",
      },
      {
        table_name: "application_reviews",
        column_name: "reviewer_employee_id",
        is_nullable: "NO",
      },
      {
        table_name: "application_versions",
        column_name: "artifact_sha256",
        is_nullable: "NO",
      },
      {
        table_name: "application_versions",
        column_name: "artifact_signature",
        is_nullable: "NO",
      },
      {
        table_name: "applications",
        column_name: "department_id",
        is_nullable: "NO",
      },
      {
        table_name: "applications",
        column_name: "maintainer_employee_id",
        is_nullable: "NO",
      },
    ]);

    const constraints = await sql<{ constraint_name: string }>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name in (
          'applications',
          'application_versions',
          'application_deliveries',
          'application_reviews',
          'application_review_queue',
          'application_audit_events'
        )
        and constraint_name in (
          'application_versions_application_id_version_unique',
          'applications_status_check',
          'application_versions_scan_status_check',
          'application_deliveries_channel_check',
          'application_reviews_decision_check',
          'application_reviews_reviewer_not_owner_check',
          'application_review_queue_status_check'
        )
      order by constraint_name
    `.execute(db!);

    expect(constraints.rows.map((row) => row.constraint_name)).toEqual([
      "application_deliveries_channel_check",
      "application_review_queue_status_check",
      "application_reviews_decision_check",
      "application_reviews_reviewer_not_owner_check",
      "application_versions_application_id_version_unique",
      "application_versions_scan_status_check",
      "applications_status_check",
    ]);
  });

  it("creates the Phase 4 catalog and interaction schema without tenant state", async () => {
    const tables = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'catalog_categories',
          'catalog_tags',
          'application_audiences',
          'application_tag_links',
          'application_catalog_metadata',
          'catalog_delivery_actions',
          'application_likes',
          'application_ratings',
          'application_comments',
          'application_reports'
        )
    `.execute(db!);

    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "application_audiences",
      "application_catalog_metadata",
      "application_comments",
      "application_likes",
      "application_ratings",
      "application_reports",
      "application_tag_links",
      "catalog_categories",
      "catalog_delivery_actions",
      "catalog_tags",
    ]);

    const columns = await sql<{ table_name: string; column_name: string }>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'tenant_id'
        and table_name in (
          'catalog_categories',
          'catalog_tags',
          'application_audiences',
          'application_tag_links',
          'application_catalog_metadata',
          'catalog_delivery_actions',
          'application_likes',
          'application_ratings',
          'application_comments',
          'application_reports'
        )
    `.execute(db!);
    expect(columns.rows).toHaveLength(0);
  });
});
