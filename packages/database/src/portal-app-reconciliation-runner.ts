import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  isPortalAppPlanRepairable,
  planPortalAppReconciliation,
  samePortalAppState,
  type PortalAppReconciliationFact,
  type PortalAppReconciliationPlan,
  type PortalAppStateSnapshot,
  type ReconciledApplicationStatus,
} from "./portal-app-reconciliation.js";
import type { DatabaseSchema } from "./schema.js";

interface ApplicationRow {
  application_id: string;
  status: ReconciledApplicationStatus;
  current_version_id: string | null;
  pending_version_id: string | null;
}

interface VersionRow {
  application_version_id: string;
  created_at: Date;
}

interface ReviewRow {
  application_version_id: string;
  decision: "approve" | "reject" | "request_changes";
}

interface QueueRow {
  application_version_id: string;
  status: "available" | "claimed" | "completed";
}

interface EventRow {
  event_type: string;
}

interface ReconciliationAuditRow {
  audit_event_id: string;
  subject: string | null;
  details: unknown;
}

export async function collectPortalAppReconciliationPlans(
  database: Kysely<DatabaseSchema>,
): Promise<PortalAppReconciliationPlan[]> {
  const candidates = await sql<ApplicationRow>`
    select a.application_id, a.status, a.current_version_id, a.pending_version_id
    from applications a
    where exists (
      select 1
      from outbox_events o
      where o.aggregate_id = a.application_id::text
        and o.event_type like 'portal.app.%'
    )
    or exists (
      select 1
      from security_audit_events s
      where s.module = 'portal'
        and s.subject = concat('app:', a.application_id::text)
    )
    order by a.application_id
  `.execute(database);

  const plans = await Promise.all(
    candidates.rows.map(async (application) => {
      const [versions, reviews, queues, portalEvents, canonicalPublishedEvent] =
        await Promise.all([
          database
            .selectFrom("application_versions")
            .select(["application_version_id", "created_at"])
            .where("application_id", "=", application.application_id)
            .execute() as Promise<VersionRow[]>,
          database
            .selectFrom("application_reviews")
            .select(["application_version_id", "decision"])
            .where("application_id", "=", application.application_id)
            .execute() as Promise<ReviewRow[]>,
          database
            .selectFrom("application_review_queue")
            .select(["application_version_id", "status"])
            .where("application_id", "=", application.application_id)
            .execute() as Promise<QueueRow[]>,
          sql<EventRow>`
            select event_type
            from outbox_events
            where aggregate_id = ${application.application_id}
              and event_type like 'portal.app.%'
            union all
            select concat('audit:', action) as event_type
            from security_audit_events
            where module = 'portal'
              and subject = ${`app:${application.application_id}`}
          `.execute(database),
          database
            .selectFrom("outbox_events")
            .select("id")
            .where("aggregate_id", "=", application.application_id)
            .where("event_type", "=", "application.published")
            .executeTakeFirst(),
        ]);
      const fact: PortalAppReconciliationFact = {
        applicationId: application.application_id,
        status: application.status,
        currentVersionId: application.current_version_id,
        pendingVersionId: application.pending_version_id,
        versions: versions.map((version) => ({
          applicationVersionId: version.application_version_id,
          createdAt: version.created_at,
        })),
        reviews: reviews.map((review) => ({
          applicationVersionId: review.application_version_id,
          decision: review.decision,
        })),
        queues: queues.map((queue) => ({
          applicationVersionId: queue.application_version_id,
          status: queue.status,
        })),
        history: {
          hasCanonicalPublishedEvent: canonicalPublishedEvent !== undefined,
          hasPortalPublishedEvent: portalEvents.rows.some((event) =>
            event.event_type.toLowerCase().includes("published"),
          ),
          portalEventTypes: portalEvents.rows.map((event) => event.event_type),
        },
      };
      return planPortalAppReconciliation(fact);
    }),
  );
  return plans.filter(
    (plan): plan is PortalAppReconciliationPlan => plan !== null,
  );
}

export async function applyPortalAppReconciliationPlans(
  database: Kysely<DatabaseSchema>,
  plans: readonly PortalAppReconciliationPlan[],
  expectedCount: number,
): Promise<{ batchId: string | null; appliedCount: number }> {
  const repairable = plans.filter(isPortalAppPlanRepairable);
  if (repairable.length !== expectedCount) {
    throw new Error(
      `EXPECTED_COUNT_MISMATCH: expected ${expectedCount}, found ${repairable.length}`,
    );
  }
  if (repairable.length === 0) return { batchId: null, appliedCount: 0 };

  const batchId = randomUUID();
  await database.transaction().execute(async (transaction) => {
    for (const plan of repairable) {
      const updated = await sql<{ application_id: string }>`
        update applications
        set status = ${plan.after.status},
            current_version_id = ${plan.after.currentVersionId},
            pending_version_id = ${plan.after.pendingVersionId},
            updated_at = now()
        where application_id = ${plan.applicationId}
          and status = ${plan.before.status}
          and current_version_id is not distinct from ${plan.before.currentVersionId}
          and pending_version_id is not distinct from ${plan.before.pendingVersionId}
        returning application_id
      `.execute(transaction);
      if (updated.rows.length !== 1) {
        throw new Error(`RECONCILIATION_CAS_CONFLICT:${plan.applicationId}`);
      }
      const details = {
        batchId,
        applicationId: plan.applicationId,
        reasons: plan.reasons,
        before: plan.before,
        after: plan.after,
      };
      await transaction
        .insertInto("security_audit_events")
        .values({
          trace_id: null,
          module: "application-reconciliation",
          action: "application.reconciled",
          actor_employee_id: null,
          subject: `app:${plan.applicationId}`,
          result: "success",
          risk: "medium",
          ip_address: null,
          user_agent: null,
          details,
        })
        .execute();
      await transaction
        .insertInto("outbox_events")
        .values({
          event_type: "application.reconciled",
          aggregate_type: "application",
          aggregate_id: plan.applicationId,
          payload: details,
          idempotency_key: `application.reconciled:${batchId}:${plan.applicationId}`,
          status: "pending",
          attempts: 0,
          available_at: new Date(),
          claimed_by: null,
          claimed_at: null,
          last_error: null,
          completed_at: null,
        })
        .onConflict((conflict) =>
          conflict.column("idempotency_key").doNothing(),
        )
        .execute();
    }
  });
  return { batchId, appliedCount: repairable.length };
}

export async function rollbackPortalAppReconciliationBatch(
  database: Kysely<DatabaseSchema>,
  batchId: string,
): Promise<{ restoredCount: number; alreadyRestoredCount: number }> {
  const result = await sql<ReconciliationAuditRow>`
    select audit_event_id, subject, details
    from security_audit_events
    where module = 'application-reconciliation'
      and action = 'application.reconciled'
      and details ->> 'batchId' = ${batchId}
    order by audit_event_id
  `.execute(database);
  if (result.rows.length === 0) {
    throw new Error(`RECONCILIATION_BATCH_NOT_FOUND:${batchId}`);
  }

  const entries = result.rows.map((row) => {
    const snapshot = parseAuditSnapshot(row.details);
    if (snapshot === null || row.subject?.startsWith("app:") !== true) {
      throw new Error(`RECONCILIATION_AUDIT_INVALID:${row.audit_event_id}`);
    }
    return {
      auditEventId: row.audit_event_id,
      applicationId: row.subject.slice("app:".length),
      ...snapshot,
    };
  });

  const restore: typeof entries = [];
  let alreadyRestoredCount = 0;
  for (const entry of entries) {
    const application = await database
      .selectFrom("applications")
      .select(["status", "current_version_id", "pending_version_id"])
      .where("application_id", "=", entry.applicationId)
      .executeTakeFirst();
    if (application === undefined) {
      throw new Error(
        `RECONCILIATION_APPLICATION_NOT_FOUND:${entry.applicationId}`,
      );
    }
    const current = toSnapshot(application);
    if (current === null) {
      throw new Error(
        `RECONCILIATION_APPLICATION_INVALID:${entry.applicationId}`,
      );
    }
    if (samePortalAppState(current, entry.before)) {
      alreadyRestoredCount += 1;
      continue;
    }
    if (!samePortalAppState(current, entry.after)) {
      throw new Error(
        `RECONCILIATION_ROLLBACK_CONFLICT:${entry.applicationId}`,
      );
    }
    restore.push(entry);
  }

  await database.transaction().execute(async (transaction) => {
    for (const entry of restore) {
      const updated = await sql<{ application_id: string }>`
        update applications
        set status = ${entry.before.status},
            current_version_id = ${entry.before.currentVersionId},
            pending_version_id = ${entry.before.pendingVersionId},
            updated_at = now()
        where application_id = ${entry.applicationId}
          and status = ${entry.after.status}
          and current_version_id is not distinct from ${entry.after.currentVersionId}
          and pending_version_id is not distinct from ${entry.after.pendingVersionId}
        returning application_id
      `.execute(transaction);
      if (updated.rows.length !== 1) {
        throw new Error(
          `RECONCILIATION_ROLLBACK_CAS_CONFLICT:${entry.applicationId}`,
        );
      }
      const details = {
        batchId,
        reconciliationAuditEventId: entry.auditEventId,
        applicationId: entry.applicationId,
        before: entry.before,
        after: entry.after,
      };
      await transaction
        .insertInto("security_audit_events")
        .values({
          trace_id: null,
          module: "application-reconciliation",
          action: "application.reconciliation.rolled_back",
          actor_employee_id: null,
          subject: `app:${entry.applicationId}`,
          result: "success",
          risk: "medium",
          ip_address: null,
          user_agent: null,
          details,
        })
        .execute();
      await transaction
        .insertInto("outbox_events")
        .values({
          event_type: "application.reconciliation.rolled_back",
          aggregate_type: "application",
          aggregate_id: entry.applicationId,
          payload: details,
          idempotency_key: `application.reconciliation.rollback:${batchId}:${entry.applicationId}`,
          status: "pending",
          attempts: 0,
          available_at: new Date(),
          claimed_by: null,
          claimed_at: null,
          last_error: null,
          completed_at: null,
        })
        .onConflict((conflict) =>
          conflict.column("idempotency_key").doNothing(),
        )
        .execute();
    }
  });
  return { restoredCount: restore.length, alreadyRestoredCount };
}

function parseAuditSnapshot(
  details: unknown,
): { before: PortalAppStateSnapshot; after: PortalAppStateSnapshot } | null {
  if (!isRecord(details)) return null;
  const before = toSnapshot(details.before);
  const after = toSnapshot(details.after);
  return before === null || after === null ? null : { before, after };
}

function toSnapshot(value: unknown): PortalAppStateSnapshot | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  const currentVersionId =
    "currentVersionId" in value
      ? value.currentVersionId
      : value.current_version_id;
  const pendingVersionId =
    "pendingVersionId" in value
      ? value.pendingVersionId
      : value.pending_version_id;
  if (!isApplicationStatus(status)) return null;
  if (currentVersionId !== null && typeof currentVersionId !== "string") {
    return null;
  }
  if (pendingVersionId !== null && typeof pendingVersionId !== "string") {
    return null;
  }
  return { status, currentVersionId, pendingVersionId };
}

function isApplicationStatus(
  value: unknown,
): value is ReconciledApplicationStatus {
  return (
    value === "draft" ||
    value === "in_review" ||
    value === "approved" ||
    value === "published" ||
    value === "withdrawn" ||
    value === "archived"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
