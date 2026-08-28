import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgresTestContainer } from "@ai-hub/testing";
import {
  applyPortalAppReconciliationPlans,
  collectPortalAppReconciliationPlans,
  createDatabase,
  rollbackPortalAppReconciliationBatch,
  runMigrations,
} from "./index.js";

describe("Portal app reconciliation 数据库集成", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("dry-run 零写入，apply 幂等，rollback 恢复原状态", async () => {
    const suffix = randomUUID();
    const departmentId = `portal-reconcile-${suffix}`;
    const employeeId = `E-PORTAL-RECONCILE-${suffix}`;
    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: "Portal 对账测试部门",
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values({
        employee_id: employeeId,
        employee_number: `REC-${suffix}`,
        display_name: "Portal 对账测试员工",
        status: "active",
        primary_department_id: departmentId,
        password_hash: null,
        password_reset_required: false,
      })
      .execute();
    await db
      .insertInto("department_memberships")
      .values({
        employee_id: employeeId,
        department_id: departmentId,
        is_primary: true,
      })
      .execute();

    const application = await db
      .insertInto("applications")
      .values({
        owner_employee_id: employeeId,
        maintainer_employee_id: employeeId,
        department_id: departmentId,
        name: "待对账 Portal 应用",
        summary: "current_version_id 缺少标准审核通过证据",
        status: "draft",
        current_version_id: null,
        pending_version_id: null,
      })
      .returning("application_id")
      .executeTakeFirstOrThrow();
    const version = await db
      .insertInto("application_versions")
      .values({
        application_id: application.application_id,
        version: "1.0.0",
        changelog: "历史 Portal 版本",
        artifact_key: null,
        artifact_sha256: null,
        artifact_signature: null,
        scan_status: "passed",
        created_by_employee_id: employeeId,
      })
      .returning("application_version_id")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("applications")
      .set({ current_version_id: version.application_version_id })
      .where("application_id", "=", application.application_id)
      .execute();
    await db
      .insertInto("outbox_events")
      .values({
        event_type: "portal.app.version_saved",
        aggregate_type: "portal.app",
        aggregate_id: application.application_id,
        payload: { source: "integration-test" },
        idempotency_key: `portal.app.version_saved:${suffix}`,
        status: "pending",
        attempts: 0,
        available_at: new Date(),
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        completed_at: null,
      })
      .execute();

    const dryRunPlans = await collectPortalAppReconciliationPlans(db);
    expect(dryRunPlans).toEqual([
      expect.objectContaining({
        applicationId: application.application_id,
        before: {
          status: "draft",
          currentVersionId: version.application_version_id,
          pendingVersionId: null,
        },
        after: {
          status: "draft",
          currentVersionId: null,
          pendingVersionId: null,
        },
      }),
    ]);
    expect(
      await db
        .selectFrom("security_audit_events")
        .select("audit_event_id")
        .where("module", "=", "application-reconciliation")
        .execute(),
    ).toEqual([]);

    const applied = await applyPortalAppReconciliationPlans(db, dryRunPlans, 1);
    expect(applied.appliedCount).toBe(1);
    expect(applied.batchId).not.toBeNull();
    const repaired = await db
      .selectFrom("applications")
      .select(["status", "current_version_id", "pending_version_id"])
      .where("application_id", "=", application.application_id)
      .executeTakeFirstOrThrow();
    expect(repaired).toEqual({
      status: "draft",
      current_version_id: null,
      pending_version_id: null,
    });
    expect(
      await db
        .selectFrom("outbox_events")
        .select("event_type")
        .where("aggregate_id", "=", application.application_id)
        .where("event_type", "=", "application.reconciled")
        .execute(),
    ).toHaveLength(1);

    const rerunPlans = await collectPortalAppReconciliationPlans(db);
    expect(rerunPlans).toEqual([]);
    await expect(
      applyPortalAppReconciliationPlans(db, rerunPlans, 0),
    ).resolves.toEqual({ batchId: null, appliedCount: 0 });

    const rollback = await rollbackPortalAppReconciliationBatch(
      db,
      applied.batchId as string,
    );
    expect(rollback).toEqual({ restoredCount: 1, alreadyRestoredCount: 0 });
    const restored = await db
      .selectFrom("applications")
      .select(["status", "current_version_id", "pending_version_id"])
      .where("application_id", "=", application.application_id)
      .executeTakeFirstOrThrow();
    expect(restored).toEqual({
      status: "draft",
      current_version_id: version.application_version_id,
      pending_version_id: null,
    });
    await expect(
      rollbackPortalAppReconciliationBatch(db, applied.batchId as string),
    ).resolves.toEqual({ restoredCount: 0, alreadyRestoredCount: 1 });
  });
});
