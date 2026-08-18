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
  const claimedExpiredReview = {
    applicationVersionId: "version-1",
    claimedByEmployeeId: "reviewer-1",
    ownerEmployeeId: "owner-1",
    name: "示例应用",
  };

  const availableExpiredReview = {
    applicationVersionId: "version-2",
    claimedByEmployeeId: null,
    ownerEmployeeId: "owner-2",
    name: "未领取应用",
  };

  it("reminds the claimer of a claimed review past SLA (24h)", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner({
      listExpiredReviews: async () => [claimedExpiredReview],
      listApplicationAdmins: async () => [],
      createNotification,
      now: () => new Date("2026-08-18T10:00:00Z"),
    });

    await runner();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith({
      recipientEmployeeId: "reviewer-1",
      eventType: "application.review.sla.reminder",
      aggregateId: "version-1",
      message: expect.stringContaining("示例应用"),
    });
  });

  it("notifies every application admin and super admin of overdue reviews (48h)", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner({
      listExpiredReviews: async () => [claimedExpiredReview],
      listApplicationAdmins: async () => ["admin-1", "super-1"],
      createNotification,
      now: () => new Date("2026-08-18T10:00:00Z"),
    });

    await runner();

    expect(createNotification).toHaveBeenCalledTimes(3);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmployeeId: "admin-1",
        eventType: "application.review.sla.overdue",
        aggregateId: "version-1",
        message: expect.stringContaining("示例应用"),
      }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmployeeId: "super-1",
        eventType: "application.review.sla.overdue",
        aggregateId: "version-1",
      }),
    );
  });

  it("does not remind a claimer while the expired review is still available", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner({
      listExpiredReviews: async () => [availableExpiredReview],
      listApplicationAdmins: async () => ["admin-1"],
      createNotification,
      now: () => new Date("2026-08-18T10:00:00Z"),
    });

    await runner();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmployeeId: "admin-1",
        eventType: "application.review.sla.overdue",
        aggregateId: "version-2",
      }),
    );
  });

  it("skips reviews that are not yet past their SLA deadline", async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const runner = createSlaReminderRunner({
      listExpiredReviews: async () => [],
      listApplicationAdmins: async () => ["admin-1"],
      createNotification,
      now: () => new Date("2026-08-18T10:00:00Z"),
    });

    await runner();

    expect(createNotification).not.toHaveBeenCalled();
  });
});
