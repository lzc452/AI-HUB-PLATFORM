import { describe, expect, it } from "vitest";
import { buildCatalogFixture } from "./catalog.fixture.js";

const ANCHOR = new Date("2025-06-15T12:00:00.000Z");

describe("buildCatalogFixture", () => {
  const fixture = buildCatalogFixture(ANCHOR);

  // ── counts ────────────────────────────────────────────────────────────────

  it("produces 15 categories", () => {
    expect(fixture.categories).toHaveLength(15);
  });

  it("produces 18 tags", () => {
    expect(fixture.tags).toHaveLength(18);
  });

  it("produces 10 catalog metadata entries", () => {
    expect(fixture.metadata).toHaveLength(10);
  });

  it("produces 3 audiences", () => {
    expect(fixture.audiences).toHaveLength(3);
  });

  it("produces 23 tag links", () => {
    expect(fixture.tagLinks).toHaveLength(23);
  });

  it("produces 6 labels", () => {
    expect(fixture.labels).toHaveLength(6);
  });

  it("produces 13 delivery actions", () => {
    expect(fixture.deliveryActions).toHaveLength(13);
  });

  // ── FK resolution ─────────────────────────────────────────────────────────

  it("all category ids are unique", () => {
    const ids = fixture.categories.map((c) => c.category_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all tag ids are unique", () => {
    const ids = fixture.tags.map((t) => t.tag_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all audience ids are unique", () => {
    const ids = fixture.audiences.map((a) => a.audience_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all delivery action ids are unique", () => {
    const ids = fixture.deliveryActions.map((a) => a.action_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("metadata application_id references are all distinct (one per published app)", () => {
    const ids = fixture.metadata.map((m) => m.application_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("metadata category_id references resolve within categories", () => {
    const catIds = new Set(fixture.categories.map((c) => c.category_id));
    for (const m of fixture.metadata) {
      expect(catIds.has(m.category_id)).toBe(true);
    }
  });

  it("metadata replacement_application_id is null or references a published app within metadata", () => {
    const metadataAppIds = new Set(
      fixture.metadata.map((m) => m.application_id),
    );
    for (const m of fixture.metadata) {
      if (m.replacement_application_id !== null) {
        expect(metadataAppIds.has(m.replacement_application_id!)).toBe(true);
      }
    }
  });

  it("audience application_id references resolve within metadata", () => {
    const metadataAppIds = new Set(
      fixture.metadata.map((m) => m.application_id),
    );
    for (const a of fixture.audiences) {
      expect(metadataAppIds.has(a.application_id)).toBe(true);
    }
  });

  it("tag link application_id references resolve within metadata", () => {
    const metadataAppIds = new Set(
      fixture.metadata.map((m) => m.application_id),
    );
    for (const tl of fixture.tagLinks) {
      expect(metadataAppIds.has(tl.application_id)).toBe(true);
    }
  });

  it("tag link tag_id references resolve within tags", () => {
    const tagIds = new Set(fixture.tags.map((t) => t.tag_id));
    for (const tl of fixture.tagLinks) {
      expect(tagIds.has(tl.tag_id)).toBe(true);
    }
  });

  it("label application_id references resolve within metadata", () => {
    const metadataAppIds = new Set(
      fixture.metadata.map((m) => m.application_id),
    );
    for (const l of fixture.labels) {
      expect(metadataAppIds.has(l.application_id)).toBe(true);
    }
  });

  it("delivery action application_id references resolve within metadata", () => {
    const metadataAppIds = new Set(
      fixture.metadata.map((m) => m.application_id),
    );
    for (const da of fixture.deliveryActions) {
      expect(metadataAppIds.has(da.application_id)).toBe(true);
    }
  });

  it("delivery action actor_employee_id reference is a valid demo employee", () => {
    const validEmployees = new Set(["DEMO-EMPLOYEE", "DEMO-SUPER-ADMIN"]);
    for (const da of fixture.deliveryActions) {
      expect(validEmployees.has(da.actor_employee_id)).toBe(true);
    }
  });

  it("audience department_id references a valid demo department when set", () => {
    const validDepts = new Set([
      "demo-company",
      "demo-rnd",
      "demo-innovation",
      "demo-admin",
    ]);
    for (const a of fixture.audiences) {
      if (a.department_id !== null) {
        expect(validDepts.has(a.department_id!)).toBe(true);
      }
    }
  });

  it("audience employee_id references a valid demo employee when set", () => {
    const validEmployees = new Set(["DEMO-EMPLOYEE", "DEMO-SUPER-ADMIN"]);
    for (const a of fixture.audiences) {
      if (a.employee_id !== null) {
        expect(validEmployees.has(a.employee_id!)).toBe(true);
      }
    }
  });

  // ── health status distribution ────────────────────────────────────────────

  it("has exactly 7 healthy metadata entries", () => {
    const count = fixture.metadata.filter(
      (m) => m.health_status === "healthy",
    ).length;
    expect(count).toBe(7);
  });

  it("has at least 2 degraded metadata entries", () => {
    const count = fixture.metadata.filter(
      (m) => m.health_status === "degraded",
    ).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("has exactly 1 metadata entry with replacement tracking", () => {
    const count = fixture.metadata.filter(
      (m) => m.replacement_application_id !== null,
    ).length;
    expect(count).toBe(1);
  });

  it("the replacement entry references a different application than itself", () => {
    const replacementEntry = fixture.metadata.find(
      (m) => m.replacement_application_id !== null,
    );
    expect(replacementEntry).toBeDefined();
    expect(replacementEntry!.application_id).not.toBe(
      replacementEntry!.replacement_application_id,
    );
  });

  // ── audience coverage ─────────────────────────────────────────────────────

  it("covers all 3 audience types", () => {
    const types = new Set(fixture.audiences.map((a) => a.audience_type));
    expect(types.has("all")).toBe(true);
    expect(types.has("department")).toBe(true);
    expect(types.has("employee")).toBe(true);
  });

  it("audience type 'all' has no department_id or employee_id", () => {
    const allAudience = fixture.audiences.find(
      (a) => a.audience_type === "all",
    );
    expect(allAudience).toBeDefined();
    expect(allAudience!.department_id).toBeNull();
    expect(allAudience!.employee_id).toBeNull();
  });

  it("audience type 'department' has a department_id", () => {
    const deptAudience = fixture.audiences.find(
      (a) => a.audience_type === "department",
    );
    expect(deptAudience).toBeDefined();
    expect(deptAudience!.department_id).not.toBeNull();
    expect(deptAudience!.include_children).toBe(true);
  });

  it("audience type 'employee' has an employee_id", () => {
    const empAudience = fixture.audiences.find(
      (a) => a.audience_type === "employee",
    );
    expect(empAudience).toBeDefined();
    expect(empAudience!.employee_id).not.toBeNull();
  });

  // ── tag link distribution ─────────────────────────────────────────────────

  it("each published app with metadata has 2-3 tag links", () => {
    const metadataAppIds = new Set(
      fixture.metadata.map((m) => m.application_id),
    );
    for (const appId of metadataAppIds) {
      const linkCount = fixture.tagLinks.filter(
        (tl) => tl.application_id === appId,
      ).length;
      expect(linkCount).toBeGreaterThanOrEqual(2);
      expect(linkCount).toBeLessThanOrEqual(3);
    }
  });

  // ── delivery action coverage ──────────────────────────────────────────────

  it("covers all 3 action types", () => {
    const types = new Set(fixture.deliveryActions.map((da) => da.action_type));
    expect(types.has("web_redirect")).toBe(true);
    expect(types.has("package_download")).toBe(true);
    expect(types.has("qr_display")).toBe(true);
  });

  it("has delivery actions across multiple channels", () => {
    const channels = new Set(
      fixture.deliveryActions
        .map((da) => da.channel)
        .filter((c): c is string => c !== null),
    );
    expect(channels.size).toBeGreaterThanOrEqual(2);
  });

  // ── data integrity ────────────────────────────────────────────────────────

  it("all categories are enabled", () => {
    for (const c of fixture.categories) {
      expect(c.enabled).toBe(true);
    }
  });

  it("all tags are enabled", () => {
    for (const t of fixture.tags) {
      expect(t.enabled).toBe(true);
    }
  });

  it("all metadata entries have valid health_status values", () => {
    const valid = new Set(["unknown", "healthy", "degraded", "failed"]);
    for (const m of fixture.metadata) {
      expect(valid.has(m.health_status)).toBe(true);
    }
  });

  it("labels exist only for degraded or replacement apps", () => {
    const degradedOrReplacementAppIds = new Set(
      fixture.metadata
        .filter(
          (m) =>
            m.health_status === "degraded" ||
            m.replacement_application_id !== null,
        )
        .map((m) => m.application_id),
    );
    for (const l of fixture.labels) {
      expect(degradedOrReplacementAppIds.has(l.application_id)).toBe(true);
    }
  });

  it("sort_order is strictly increasing for categories", () => {
    for (let i = 1; i < fixture.categories.length; i++) {
      expect(fixture.categories[i]!.sort_order).toBeGreaterThan(
        fixture.categories[i - 1]!.sort_order,
      );
    }
  });

  // ── timestamps ────────────────────────────────────────────────────────────

  it("all delivery action occurred_at values are Date instances", () => {
    for (const da of fixture.deliveryActions) {
      expect(da.occurred_at).toBeInstanceOf(Date);
    }
  });

  // ── immutability ──────────────────────────────────────────────────────────

  it("returns distinct arrays on each call (no shared references)", () => {
    const f2 = buildCatalogFixture(ANCHOR);
    expect(fixture.categories).not.toBe(f2.categories);
    expect(fixture.tags).not.toBe(f2.tags);
    expect(fixture.metadata).not.toBe(f2.metadata);
    expect(fixture.audiences).not.toBe(f2.audiences);
    expect(fixture.tagLinks).not.toBe(f2.tagLinks);
    expect(fixture.labels).not.toBe(f2.labels);
    expect(fixture.deliveryActions).not.toBe(f2.deliveryActions);
  });
});
