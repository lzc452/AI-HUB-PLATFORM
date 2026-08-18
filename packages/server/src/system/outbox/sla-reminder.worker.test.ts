import { describe, expect, it, vi } from "vitest";
import {
  addBusinessDays,
  createSlaReminderRunner,
} from "./sla-reminder.worker.js";

describe("addBusinessDays", () => {
  it("adds two business days skipping weekends", () => {
    // 2026-08-14 是周五
    expect(
      addBusinessDays(new Date("2026-08-14T10:00:00Z"), 2).toISOString(),
    ).toBe("2026-08-18T10:00:00.000Z");
    // 周四 + 2 = 周一
    expect(
      addBusinessDays(new Date("2026-08-13T10:00:00Z"), 2).toISOString(),
    ).toBe("2026-08-17T10:00:00.000Z");
  });

  it("skips weekends when adding across a Friday", () => {
    // 周五 + 1 = 下周一
    expect(
      addBusinessDays(new Date("2026-08-14T10:00:00Z"), 1).toISOString(),
    ).toBe("2026-08-17T10:00:00.000Z");
    // 周六起算 + 1 = 下周一
    expect(
      addBusinessDays(new Date("2026-08-15T10:00:00Z"), 1).toISOString(),
    ).toBe("2026-08-17T10:00:00.000Z");
    // 周日 + 1 = 下周一
    expect(
      addBusinessDays(new Date("2026-08-16T10:00:00Z"), 1).toISOString(),
    ).toBe("2026-08-17T10:00:00.000Z");
  });

  it("preserves the time of day", () => {
    expect(
      addBusinessDays(new Date("2026-08-14T14:30:00.000Z"), 2).toISOString(),
    ).toBe("2026-08-18T14:30:00.000Z");
  });
});

describe("createSlaReminderRunner", () => {
  const claimedDueReview = {
    applicationVersionId: "version-1",
    claimedByEmployeeId: "reviewer-1",
    ownerEmployeeId: "owner-1",
    name: "示例应用",
  };

  const availableDueReview = {
    applicationVersionId: "version-2",
    claimedByEmployeeId: null,
    ownerEmployeeId: "owner-2",
    name: "未领取应用",
  };

  const expiredReview = {
    applicationVersionId: "version-3",
    claimedByEmployeeId: "reviewer-3",
    ownerEmployeeId: "owner-3",
    name: "超时应用",
  };

  const runnerDeps = (
    overrides: Partial<Parameters<typeof createSlaReminderRunner>[0]> = {},
  ): Parameters<typeof createSlaReminderRunner>[0] => ({
    listReviewsDueWithin: async () => [],
    listExpiredReviews: async () => [],
    listApplicationAdmins: async () => [],
    createNotification: vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-08-18T10:00:00Z"),
    ...overrides,
  });

  it("reminds only the claimer when the SLA deadline is within 24h and the review is claimed", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner(
      runnerDeps({
        listReviewsDueWithin: async () => [claimedDueReview],
        createNotification,
      }),
    );

    await runner();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith({
      recipientEmployeeId: "reviewer-1",
      eventType: "application.review.sla.reminder",
      aggregateId: "version-1",
      message: expect.stringContaining("示例应用"),
    });
  });

  it("does not remind a claimer when an available review is near the deadline", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner(
      runnerDeps({
        listReviewsDueWithin: async () => [availableDueReview],
        createNotification,
      }),
    );

    await runner();

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("notifies only application admins and super admins when the review is past SLA", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner(
      runnerDeps({
        listExpiredReviews: async () => [expiredReview],
        listApplicationAdmins: async () => ["admin-1", "super-1"],
        createNotification,
      }),
    );

    await runner();

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmployeeId: "admin-1",
        eventType: "application.review.sla.overdue",
        aggregateId: "version-3",
        message: expect.stringContaining("超时应用"),
      }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmployeeId: "super-1",
        eventType: "application.review.sla.overdue",
        aggregateId: "version-3",
      }),
    );
    expect(createNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "application.review.sla.reminder" }),
    );
  });

  it("does not notify anyone while the SLA deadline is still more than 24h away", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner(
      runnerDeps({
        listApplicationAdmins: async () => ["admin-1"],
        createNotification,
      }),
    );

    await runner();

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("does not notify anyone once the review is past SLA and concluded", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner(
      runnerDeps({
        listApplicationAdmins: async () => ["admin-1"],
        createNotification,
      }),
    );

    await runner();

    expect(createNotification).not.toHaveBeenCalled();
  });
});
