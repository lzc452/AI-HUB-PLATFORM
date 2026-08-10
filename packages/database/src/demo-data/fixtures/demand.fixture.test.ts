import { describe, expect, it } from "vitest";
import { buildDemandFixture } from "./demand.fixture.js";
import type { DemandStatus } from "@ai-hub/contracts";
import type {
  AiDemandsTable,
  AiDemandCollaboratorsTable,
  AiDemandAuditEventsTable,
} from "../../schema.js";

const ANCHOR = new Date("2025-06-15T12:00:00.000Z");

describe("buildDemandFixture", () => {
  const fixture = buildDemandFixture(ANCHOR);

  // ── counts ─────────────────────────────────────────────────────────────────

  it("produces 18 demands", () => {
    expect(fixture.demands).toHaveLength(18);
  });

  it("produces 6 demand collaborators", () => {
    expect(fixture.demandCollaborators).toHaveLength(6);
  });

  it("produces 10 demand audit events", () => {
    expect(fixture.demandAuditEvents).toHaveLength(10);
  });

  // ── status distribution ────────────────────────────────────────────────────

  it("has exactly 3 draft demands", () => {
    const count = fixture.demands.filter((d) => d.status === "draft").length;
    expect(count).toBe(3);
  });

  it("has exactly 2 pending_review demands", () => {
    const count = fixture.demands.filter(
      (d) => d.status === "pending_review",
    ).length;
    expect(count).toBe(2);
  });

  it("has exactly 2 rejected demands", () => {
    const count = fixture.demands.filter((d) => d.status === "rejected").length;
    expect(count).toBe(2);
  });

  it("has exactly 2 published demands", () => {
    const count = fixture.demands.filter((d) => d.status === "published").length;
    expect(count).toBe(2);
  });

  it("has exactly 3 in_progress demands", () => {
    const count = fixture.demands.filter(
      (d) => d.status === "in_progress",
    ).length;
    expect(count).toBe(3);
  });

  it("has exactly 1 pilot demand", () => {
    const count = fixture.demands.filter((d) => d.status === "pilot").length;
    expect(count).toBe(1);
  });

  it("has exactly 2 completed demands", () => {
    const count = fixture.demands.filter((d) => d.status === "completed")
      .length;
    expect(count).toBe(2);
  });

  it("has exactly 1 closed demand", () => {
    const count = fixture.demands.filter((d) => d.status === "closed").length;
    expect(count).toBe(1);
  });

  it("has exactly 2 merged demands", () => {
    const count = fixture.demands.filter((d) => d.status === "merged").length;
    expect(count).toBe(2);
  });

  it("covers all 9 demand statuses", () => {
    const statuses = new Set(fixture.demands.map((d) => d.status));
    const expected: DemandStatus[] = [
      "draft",
      "pending_review",
      "rejected",
      "published",
      "in_progress",
      "pilot",
      "completed",
      "closed",
      "merged",
    ];
    for (const s of expected) {
      expect(statuses.has(s)).toBe(true);
    }
  });

  // ── FK resolution ──────────────────────────────────────────────────────────

  it("all demand ids are unique", () => {
    const ids = fixture.demands.map((d) => d.demand_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all collaborator pairs are unique", () => {
    const keys = fixture.demandCollaborators.map(
      (c) => `${c.demand_id}:${c.employee_id}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("all audit event ids are unique", () => {
    const ids = fixture.demandAuditEvents.map((e) => e.audit_event_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("collaborator demand_id references resolve within demands", () => {
    const demandIds = new Set(fixture.demands.map((d) => d.demand_id));
    for (const c of fixture.demandCollaborators) {
      expect(demandIds.has(c.demand_id)).toBe(true);
    }
  });

  it("audit event demand_id references resolve within demands", () => {
    const demandIds = new Set(fixture.demands.map((d) => d.demand_id));
    for (const ev of fixture.demandAuditEvents) {
      expect(demandIds.has(ev.demand_id)).toBe(true);
    }
  });

  it("merged_into_demand_id references resolve within demands", () => {
    const demandIds = new Set(fixture.demands.map((d) => d.demand_id));
    for (const d of fixture.demands) {
      if (d.merged_into_demand_id !== null) {
        expect(demandIds.has(d.merged_into_demand_id)).toBe(true);
      }
    }
  });

  // ── scenario pre-conditions ────────────────────────────────────────────────

  it("provides a pending_review demand for demand.review.approve", () => {
    // The first pending_review demand (index 3) should have displayAnonymously=false
    // and be ready for review approval
    const prDemands = fixture.demands.filter(
      (d) => d.status === "pending_review",
    );
    const approveCandidate = prDemands.find(
      (d) => d.display_anonymously === false,
    );
    expect(approveCandidate).toBeDefined();
    expect(approveCandidate!.requester_employee_id).toBeTruthy();
  });

  it("provides a pending_review demand for demand.review.reject", () => {
    // The second pending_review demand (index 4) should have displayAnonymously=true
    // and be ready for review rejection
    const prDemands = fixture.demands.filter(
      (d) => d.status === "pending_review",
    );
    const rejectCandidate = prDemands.find(
      (d) => d.display_anonymously === true,
    );
    expect(rejectCandidate).toBeDefined();
  });

  it("provides published demands with no owner for demand.claim.available", () => {
    const published = fixture.demands.filter(
      (d) => d.status === "published",
    );
    expect(published.length).toBe(2);
    for (const d of published) {
      expect(d.owner_employee_id).toBeNull();
      expect(d.published_at).not.toBeNull();
    }
  });

  it("provides in_progress demands for demand.status.transition", () => {
    const inProgress = fixture.demands.filter(
      (d) => d.status === "in_progress",
    );
    expect(inProgress.length).toBe(3);
    for (const d of inProgress) {
      expect(d.owner_employee_id).not.toBeNull();
      expect(d.published_at).not.toBeNull();
    }
  });

  it("provides merged demand pair for demand.merge.source + demand.merge.target", () => {
    const merged = fixture.demands.filter((d) => d.status === "merged");
    expect(merged.length).toBe(2);
    // One should have merged_into_demand_id set (source), the other null (target)
    const source = merged.find((d) => d.merged_into_demand_id !== null);
    const target = merged.find((d) => d.merged_into_demand_id === null);
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    // Source should point to target
    expect(source!.merged_into_demand_id).toBe(target!.demand_id);
  });

  it("provides a pilot demand for demand.pilot.manage", () => {
    const pilot = fixture.demands.find((d) => d.status === "pilot");
    expect(pilot).toBeDefined();
    expect(pilot!.owner_employee_id).not.toBeNull();
    expect(pilot!.primary_solution_application_id).not.toBeNull();
  });

  it("provides a closed demand for demand.closed.archived", () => {
    const closed = fixture.demands.find((d) => d.status === "closed");
    expect(closed).toBeDefined();
    expect(closed!.closed_at).not.toBeNull();
    expect(closed!.review_reason).toBeTruthy();
  });

  it("provides rejected demands with review_reason set", () => {
    const rejected = fixture.demands.filter((d) => d.status === "rejected");
    expect(rejected.length).toBe(2);
    for (const d of rejected) {
      expect(d.review_reason).toBeTruthy();
      expect(d.review_reason!.length).toBeGreaterThanOrEqual(5);
    }
  });

  // ── priority scores on relevant statuses ───────────────────────────────────

  it("sets priority fields on published, in_progress, pilot, completed, closed, merged demands", () => {
    const priorityStatuses = new Set([
      "published",
      "in_progress",
      "pilot",
      "completed",
      "closed",
      "merged",
    ]);
    const withPriority = fixture.demands.filter(
      (d) => priorityStatuses.has(d.status),
    );
    expect(withPriority.length).toBe(11);
    for (const d of withPriority) {
      expect(d.business_value).toBeGreaterThanOrEqual(1);
      expect(d.business_value).toBeLessThanOrEqual(5);
      expect(d.implementation_cost).toBeGreaterThanOrEqual(1);
      expect(d.implementation_cost).toBeLessThanOrEqual(5);
      expect(d.risk_level).toBeGreaterThanOrEqual(1);
      expect(d.risk_level).toBeLessThanOrEqual(5);
      expect(d.admin_priority).toBeGreaterThanOrEqual(1);
      expect(d.admin_priority).toBeLessThanOrEqual(5);
      expect(d.priority_score).not.toBeNull();
      expect(d.priority_score!).toBeGreaterThan(0);
      expect(d.priority_explanation).toBeTruthy();
    }
  });

  it("leaves priority fields null on draft, pending_review, rejected demands", () => {
    const noPriorityStatuses = new Set(["draft", "pending_review", "rejected"]);
    const withoutPriority = fixture.demands.filter((d) =>
      noPriorityStatuses.has(d.status),
    );
    expect(withoutPriority.length).toBe(7);
    for (const d of withoutPriority) {
      expect(d.business_value).toBeNull();
      expect(d.implementation_cost).toBeNull();
      expect(d.risk_level).toBeNull();
      expect(d.admin_priority).toBeNull();
      expect(d.priority_score).toBeNull();
      expect(d.priority_explanation).toBeNull();
    }
  });

  // ── audience settings ───────────────────────────────────────────────────────

  it("has a mix of audience types (all, department, employee)", () => {
    const types = new Set(fixture.demands.map((d) => d.audience_type));
    expect(types.has("all")).toBe(true);
    expect(types.has("department")).toBe(true);
    expect(types.has("employee")).toBe(true);
  });

  it("has at least one demand with display_anonymously=true", () => {
    const anonymous = fixture.demands.filter(
      (d) => d.display_anonymously === true,
    );
    expect(anonymous.length).toBeGreaterThanOrEqual(1);
  });

  it("audience_type=all has null department and employee ids", () => {
    const allAudience = fixture.demands.filter(
      (d) => d.audience_type === "all",
    );
    for (const d of allAudience) {
      expect(d.audience_department_id).toBeNull();
      expect(d.audience_employee_id).toBeNull();
    }
  });

  it("audience_type=department has non-null department_id and null employee_id", () => {
    const deptAudience = fixture.demands.filter(
      (d) => d.audience_type === "department",
    );
    expect(deptAudience.length).toBeGreaterThanOrEqual(1);
    for (const d of deptAudience) {
      expect(d.audience_department_id).not.toBeNull();
      expect(d.audience_employee_id).toBeNull();
    }
  });

  it("audience_type=employee has null department_id and non-null employee_id", () => {
    const empAudience = fixture.demands.filter(
      (d) => d.audience_type === "employee",
    );
    expect(empAudience.length).toBeGreaterThanOrEqual(1);
    for (const d of empAudience) {
      expect(d.audience_department_id).toBeNull();
      expect(d.audience_employee_id).not.toBeNull();
    }
  });

  // ── audit events ───────────────────────────────────────────────────────────

  it("audit events cover key state transitions", () => {
    const eventTypes = new Set(
      fixture.demandAuditEvents.map((e) => e.event_type),
    );
    expect(eventTypes.has("demand.submitted")).toBe(true);
    expect(eventTypes.has("demand.reviewed")).toBe(true);
    expect(eventTypes.has("demand.claimed")).toBe(true);
    expect(eventTypes.has("demand.status.changed")).toBe(true);
    expect(eventTypes.has("demand.merged")).toBe(true);
    expect(eventTypes.has("demand.merge.received")).toBe(true);
  });

  it("reviewed audit events have decision in details", () => {
    const reviewed = fixture.demandAuditEvents.filter(
      (e) => e.event_type === "demand.reviewed",
    );
    expect(reviewed.length).toBeGreaterThanOrEqual(1);
    for (const ev of reviewed) {
      const details = ev.details as Record<string, unknown>;
      expect(details.decision).toBeDefined();
    }
  });

  it("merged audit events reference target/source demand ids", () => {
    const merged = fixture.demandAuditEvents.filter(
      (e) => e.event_type === "demand.merged",
    );
    const mergeReceived = fixture.demandAuditEvents.filter(
      (e) => e.event_type === "demand.merge.received",
    );
    expect(merged.length).toBe(1);
    expect(mergeReceived.length).toBe(1);

    const mergedDetails = merged[0]!.details as Record<string, unknown>;
    const receivedDetails = mergeReceived[0]!
      .details as Record<string, unknown>;
    expect(mergedDetails.targetDemandId).toBeDefined();
    expect(receivedDetails.sourceDemandId).toBeDefined();
  });

  // ── collaborators ──────────────────────────────────────────────────────────

  it("collaborators have valid roles", () => {
    const validRoles = new Set(["owner", "collaborator", "operator"]);
    for (const c of fixture.demandCollaborators) {
      expect(validRoles.has(c.role)).toBe(true);
    }
  });

  it("collaborator owner roles match the demand owner_employee_id", () => {
    const demandMap = new Map(
      fixture.demands.map((d) => [d.demand_id, d]),
    );
    const ownerCollabs = fixture.demandCollaborators.filter(
      (c) => c.role === "owner",
    );
    for (const c of ownerCollabs) {
      const demand = demandMap.get(c.demand_id);
      expect(demand).toBeDefined();
      expect(c.employee_id).toBe(demand!.owner_employee_id);
    }
  });

  it("collaborators include non-owner roles for variety", () => {
    const collaboratorRoles = fixture.demandCollaborators.filter(
      (c) => c.role === "collaborator",
    );
    const operatorRoles = fixture.demandCollaborators.filter(
      (c) => c.role === "operator",
    );
    expect(collaboratorRoles.length).toBeGreaterThanOrEqual(2);
    expect(operatorRoles.length).toBeGreaterThanOrEqual(1);
  });

  // ── timestamps ──────────────────────────────────────────────────────────────

  it("all created_at fields are Date instances", () => {
    for (const d of fixture.demands) {
      expect(d.created_at).toBeInstanceOf(Date);
      expect(d.updated_at).toBeInstanceOf(Date);
    }
    for (const c of fixture.demandCollaborators) {
      expect(c.created_at).toBeInstanceOf(Date);
    }
    for (const ev of fixture.demandAuditEvents) {
      expect(ev.created_at).toBeInstanceOf(Date);
    }
  });

  it("draft/pending_review/rejected demands have null published_at", () => {
    const unpublished = fixture.demands.filter((d) =>
      ["draft", "pending_review", "rejected"].includes(d.status),
    );
    for (const d of unpublished) {
      expect(d.published_at).toBeNull();
    }
  });

  it("published_at is set for published, in_progress, pilot, completed, closed, merged demands", () => {
    const published = fixture.demands.filter((d) =>
      ["published", "in_progress", "pilot", "completed", "closed", "merged"].includes(d.status),
    );
    expect(published.length).toBe(11);
    for (const d of published) {
      expect(d.published_at).not.toBeNull();
      expect(d.published_at).toBeInstanceOf(Date);
    }
  });

  // ── data integrity ─────────────────────────────────────────────────────────

  it("all demands have valid status enum values", () => {
    const validStatuses = new Set([
      "draft",
      "pending_review",
      "rejected",
      "published",
      "in_progress",
      "pilot",
      "completed",
      "closed",
      "merged",
    ]);
    for (const d of fixture.demands) {
      expect(validStatuses.has(d.status)).toBe(true);
    }
  });

  it("all demands have non-empty title and description fields", () => {
    for (const d of fixture.demands) {
      expect(d.title).toBeTruthy();
      expect(d.title.length).toBeGreaterThanOrEqual(2);
      expect(d.problem_statement).toBeTruthy();
      expect(d.problem_statement.length).toBeGreaterThanOrEqual(10);
      expect(d.desired_outcome).toBeTruthy();
      expect(d.desired_outcome.length).toBeGreaterThanOrEqual(10);
    }
  });

  it("all version values are positive integers", () => {
    for (const d of fixture.demands) {
      expect(Number.isInteger(d.version)).toBe(true);
      expect(d.version).toBeGreaterThanOrEqual(1);
    }
  });

  // ── immutability ────────────────────────────────────────────────────────────

  it("returns distinct arrays on each call (no shared references)", () => {
    const f2 = buildDemandFixture(ANCHOR);
    expect(fixture.demands).not.toBe(f2.demands);
    expect(fixture.demandCollaborators).not.toBe(f2.demandCollaborators);
    expect(fixture.demandAuditEvents).not.toBe(f2.demandAuditEvents);
  });
});
