import { describe, expect, it } from "vitest";
import {
  isPortalAppPlanRepairable,
  planPortalAppReconciliation,
  type PortalAppReconciliationFact,
} from "./portal-app-reconciliation.js";

const baseFact = (
  overrides: Partial<PortalAppReconciliationFact> = {},
): PortalAppReconciliationFact => ({
  applicationId: "00000000-0000-0000-0000-000000000001",
  status: "draft",
  currentVersionId: null,
  pendingVersionId: null,
  versions: [],
  reviews: [],
  queues: [],
  history: {
    hasCanonicalPublishedEvent: false,
    hasPortalPublishedEvent: false,
    portalEventTypes: ["portal.app.draft.created"],
  },
  ...overrides,
});

describe("Portal app reconciliation planning", () => {
  it("忽略没有 Portal app 历史事件的应用", () => {
    expect(
      planPortalAppReconciliation(
        baseFact({
          history: {
            hasCanonicalPublishedEvent: false,
            hasPortalPublishedEvent: false,
            portalEventTypes: [],
          },
        }),
      ),
    ).toBeNull();
  });

  it("只保留具备标准审核通过证据的 current_version_id", () => {
    const plan = planPortalAppReconciliation(
      baseFact({
        currentVersionId: "legacy-version",
        versions: [
          {
            applicationVersionId: "approved-version",
            createdAt: new Date("2026-08-24T00:00:00.000Z"),
          },
        ],
        reviews: [
          { applicationVersionId: "approved-version", decision: "approve" },
        ],
      }),
    );

    expect(plan?.after.currentVersionId).toBe("approved-version");
    expect(plan?.reasons).toContain(
      "CURRENT_VERSION_WITHOUT_APPROVAL_EVIDENCE",
    );
    expect(isPortalAppPlanRepairable(plan!)).toBe(true);
  });

  it("清理没有有效审核队列支撑的 pending_version_id", () => {
    const plan = planPortalAppReconciliation(
      baseFact({ pendingVersionId: "orphaned-version" }),
    );

    expect(plan?.after.pendingVersionId).toBeNull();
    expect(plan?.reasons).toContain(
      "PENDING_VERSION_WITHOUT_ACTIVE_REVIEW_QUEUE",
    );
  });

  it("发布态没有合法当前版本时回退为 withdrawn，不伪造审核结论", () => {
    const plan = planPortalAppReconciliation(
      baseFact({
        status: "published",
        currentVersionId: "legacy-version",
        history: {
          hasCanonicalPublishedEvent: false,
          hasPortalPublishedEvent: true,
          portalEventTypes: ["portal.app.status.published"],
        },
      }),
    );

    expect(plan?.after).toEqual({
      status: "withdrawn",
      currentVersionId: null,
      pendingVersionId: null,
    });
  });

  it("遗留 approved 状态缺少合法版本时回退为 draft", () => {
    const plan = planPortalAppReconciliation(baseFact({ status: "approved" }));

    expect(plan?.after).toEqual({
      status: "draft",
      currentVersionId: null,
      pendingVersionId: null,
    });
    expect(plan?.reasons).toContain(
      "APPROVED_WITHOUT_APPROVED_CURRENT_VERSION",
    );
  });

  it("未发布的 withdrawn 异常记录回退为 draft", () => {
    const plan = planPortalAppReconciliation(
      baseFact({
        status: "withdrawn",
        currentVersionId: "legacy-version",
      }),
    );

    expect(plan?.after).toEqual({
      status: "draft",
      currentVersionId: null,
      pendingVersionId: null,
    });
    expect(plan?.reasons).toContain("WITHDRAWN_WITHOUT_PUBLISHED_HISTORY");
  });

  it("状态与有效审核队列冲突时只报告，不自动猜测审核结果", () => {
    const plan = planPortalAppReconciliation(
      baseFact({
        status: "draft",
        queues: [
          { applicationVersionId: "pending-version", status: "available" },
        ],
      }),
    );

    expect(plan?.manualReasons).toContain(
      "ACTIVE_REVIEW_QUEUE_STATE_AMBIGUOUS",
    );
    expect(isPortalAppPlanRepairable(plan!)).toBe(false);
  });
});
