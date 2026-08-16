import { describe, expect, it } from "vitest";
import { IDS } from "./ids.js";
import {
  DEMO_ACCOUNT_DEFINITIONS,
  DEMO_DEPARTMENT_DEFINITIONS,
} from "../demo-seed.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** UUID v4 shape: 8-4-4-4-12 lowercase hex dash-separated. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Collect UUIDs from IDS without double-counting.
 *
 * When a parent object has an `all` key (like `IDS.application` or
 * `IDS.demand`), only the `all` array is traversed — the per-status
 * subgroup arrays are subsets of `all` and would cause false duplicate
 * failures.
 */
function collectUuids(obj: unknown): string[] {
  if (typeof obj === "string" && UUID_RE.test(obj)) return [obj];
  if (Array.isArray(obj)) return obj.flatMap((v) => collectUuids(v));
  if (obj && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    // When a domain has an `all` aggregation, collect only from it.
    if ("all" in record && Array.isArray(record.all)) {
      return (record.all as unknown[]).filter(
        (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v),
      );
    }
    return Object.values(record).flatMap((v) => collectUuids(v));
  }
  return [];
}

// ── uniqueness ───────────────────────────────────────────────────────────────

describe("IDS uniqueness", () => {
  it("has zero duplicate UUIDs across all domains", () => {
    const all = collectUuids(IDS);
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});

// ── counts ───────────────────────────────────────────────────────────────────

describe("IDS counts", () => {
  it("has 20 applications total", () => {
    expect(IDS.application.all).toHaveLength(20);
  });

  it("has 3 draft applications", () => {
    expect(IDS.application.draft).toHaveLength(3);
  });

  it("has 3 in_review applications", () => {
    expect(IDS.application.inReview).toHaveLength(3);
  });

  it("has 1 approved application", () => {
    expect(IDS.application.approved).toHaveLength(1);
  });

  it("has 10 published applications", () => {
    expect(IDS.application.published).toHaveLength(10);
  });

  it("has 2 withdrawn applications", () => {
    expect(IDS.application.withdrawn).toHaveLength(2);
  });

  it("has 1 archived application", () => {
    expect(IDS.application.archived).toHaveLength(1);
  });

  it("has 20 versions", () => {
    expect(IDS.version).toHaveLength(20);
  });

  it("has 44 deliveries", () => {
    expect(IDS.delivery).toHaveLength(44);
  });

  it("has 5 reviews", () => {
    expect(IDS.review).toHaveLength(5);
  });

  it("has 5 review queue entries", () => {
    expect(IDS.reviewQueue).toHaveLength(5);
  });

  it("has 15 audiences", () => {
    expect(IDS.audience).toHaveLength(15);
  });

  it("has 10 ratings", () => {
    expect(IDS.rating).toHaveLength(10);
  });

  it("has 20 application comments", () => {
    expect(IDS.appComment).toHaveLength(20);
  });

  it("has 5 application reports", () => {
    expect(IDS.appReport).toHaveLength(5);
  });

  it("has 32 delivery actions", () => {
    expect(IDS.deliveryAction).toHaveLength(32);
  });

  it("has 18 demands total", () => {
    expect(IDS.demand.all).toHaveLength(18);
  });

  it("has the correct number of demands per status", () => {
    const expected: Record<string, number> = {
      draft: 3,
      pendingReview: 2,
      rejected: 2,
      published: 2,
      inProgress: 3,
      pilot: 1,
      completed: 2,
      closed: 1,
      merged: 2,
    };
    for (const [status, count] of Object.entries(expected)) {
      expect(
        (IDS.demand as Record<string, readonly string[]>)[status],
        `demand.${status} should have ${count} entries`,
      ).toHaveLength(count);
    }
    // Total should be 18
    expect(IDS.demand.all).toHaveLength(18);
  });

  it("has 15 demand comments", () => {
    expect(IDS.demandComment).toHaveLength(15);
  });

  it("has 5 demand reports", () => {
    expect(IDS.demandReport).toHaveLength(5);
  });

  it("has 15 demand progress updates", () => {
    expect(IDS.demandProgress).toHaveLength(15);
  });

  it("has 5 demand pilots", () => {
    expect(IDS.demandPilot).toHaveLength(5);
  });

  it("has 10 application audit events", () => {
    expect(IDS.appAuditEvent).toHaveLength(10);
  });

  it("has 10 demand audit events", () => {
    expect(IDS.demandAuditEvent).toHaveLength(10);
  });

  it("has 20 notifications", () => {
    expect(IDS.notification).toHaveLength(20);
  });

  it("has 40 behavior events", () => {
    expect(IDS.behaviorEvent).toHaveLength(40);
  });
});

// ── UUID format ──────────────────────────────────────────────────────────────

describe("IDS UUID format", () => {
  it("every application UUID matches v4 shape", () => {
    for (const id of IDS.application.all) {
      expect(id).toMatch(UUID_RE);
    }
  });

  it("every version UUID matches v4 shape", () => {
    for (const id of IDS.version) {
      expect(id).toMatch(UUID_RE);
    }
  });

  it("every delivery UUID matches v4 shape", () => {
    for (const id of IDS.delivery) {
      expect(id).toMatch(UUID_RE);
    }
  });

  it("every demand UUID matches v4 shape", () => {
    for (const id of IDS.demand.all) {
      expect(id).toMatch(UUID_RE);
    }
  });

  it("all UUID-valued arrays contain only valid UUIDs", () => {
    const all = collectUuids(IDS);
    for (const id of all) {
      expect(id).toMatch(UUID_RE);
    }
  });
});

// ── naming conventions ───────────────────────────────────────────────────────

describe("IDS department / employee reuse", () => {
  it("department IDs match demo-seed.ts values", () => {
    const seedIds = DEMO_DEPARTMENT_DEFINITIONS.map((d) => d.departmentId);
    const idsValues = Object.values(IDS.department);
    for (const id of idsValues) {
      expect(seedIds).toContain(id);
    }
  });

  it("employee IDs match demo-seed.ts values", () => {
    const seedIds = DEMO_ACCOUNT_DEFINITIONS.map((a) => a.employeeId);
    const idsValues = Object.values(IDS.employee);
    for (const id of idsValues) {
      expect(seedIds).toContain(id);
    }
  });

  it("department IDs are plain strings, not UUIDs", () => {
    for (const id of Object.values(IDS.department)) {
      expect(id).not.toMatch(UUID_RE);
    }
  });

  it("employee IDs are plain strings, not UUIDs", () => {
    for (const id of Object.values(IDS.employee)) {
      expect(id).not.toMatch(UUID_RE);
    }
  });
});

// ── catalog ──────────────────────────────────────────────────────────────────

describe("IDS catalog", () => {
  it("has 5 categories", () => {
    expect(Object.keys(IDS.catalog.category)).toHaveLength(5);
  });

  it("has 8 tags", () => {
    expect(Object.keys(IDS.catalog.tag)).toHaveLength(8);
  });

  it("category IDs are plain strings, not UUIDs", () => {
    for (const id of Object.values(IDS.catalog.category)) {
      expect(id).not.toMatch(UUID_RE);
    }
  });

  it("tag IDs are plain strings, not UUIDs", () => {
    for (const id of Object.values(IDS.catalog.tag)) {
      expect(id).not.toMatch(UUID_RE);
    }
  });
});

// ── immutability ─────────────────────────────────────────────────────────────

describe("IDS immutability", () => {
  it("IDS root is frozen", () => {
    expect(Object.isFrozen(IDS)).toBe(true);
  });

  it("application arrays are frozen", () => {
    expect(Object.isFrozen(IDS.application.draft)).toBe(true);
    expect(Object.isFrozen(IDS.application.published)).toBe(true);
    expect(Object.isFrozen(IDS.application.all)).toBe(true);
  });

  it("demand arrays are frozen", () => {
    expect(Object.isFrozen(IDS.demand.draft)).toBe(true);
    expect(Object.isFrozen(IDS.demand.all)).toBe(true);
  });

  it("catalog sub-objects are frozen", () => {
    expect(Object.isFrozen(IDS.catalog)).toBe(true);
    expect(Object.isFrozen(IDS.catalog.category)).toBe(true);
    expect(Object.isFrozen(IDS.catalog.tag)).toBe(true);
  });
});

// ── sequential ordering ─────────────────────────────────────────────────────

describe("IDS sequential ordering", () => {
  it("application.all is in draft → inReview → approved → published → withdrawn → archived order", () => {
    const { all } = IDS.application;
    // First 3 are draft
    expect(all.slice(0, 3)).toEqual([...IDS.application.draft]);
    // Next 3 are in_review
    expect(all.slice(3, 6)).toEqual([...IDS.application.inReview]);
    // Next 1 is approved
    expect(all.slice(6, 7)).toEqual([...IDS.application.approved]);
    // Next 10 are published
    expect(all.slice(7, 17)).toEqual([...IDS.application.published]);
    // Next 2 are withdrawn
    expect(all.slice(17, 19)).toEqual([...IDS.application.withdrawn]);
    // Last 1 is archived
    expect(all.slice(19, 20)).toEqual([...IDS.application.archived]);
  });

  it("demand.all is in status-definition order", () => {
    const expectedStatuses = [
      "draft",
      "pendingReview",
      "rejected",
      "published",
      "inProgress",
      "pilot",
      "completed",
      "closed",
      "merged",
    ] as const;
    const { all } = IDS.demand;
    let offset = 0;
    for (const status of expectedStatuses) {
      const ids = (IDS.demand as Record<string, readonly string[]>)[status]!;
      expect(
        all.slice(offset, offset + ids.length),
        `demand.${status} slice mismatch`,
      ).toEqual([...ids]);
      offset += ids.length;
    }
  });
});

// ── access patterns ──────────────────────────────────────────────────────────

describe("IDS access patterns", () => {
  it("IDS.application.published[0] returns a UUID", () => {
    const id = IDS.application.published[0];
    expect(id).toBeDefined();
    expect(id).toMatch(UUID_RE);
  });

  it("IDS.demand.merged[0] returns a UUID", () => {
    const id = IDS.demand.merged[0];
    expect(id).toBeDefined();
    expect(id).toMatch(UUID_RE);
  });

  it("IDS.department.rnd returns the expected string", () => {
    expect(IDS.department.rnd).toBe("demo-rnd");
  });

  it("IDS.employee.appAdmin returns the expected string", () => {
    expect(IDS.employee.appAdmin).toBe("DEMO-APP-ADMIN");
  });

  it("IDS.catalog.category.ai returns the expected string", () => {
    expect(IDS.catalog.category.ai).toBe("ai");
  });
});
