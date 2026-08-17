import type { ActorContext } from "@ai-hub/contracts";
import { describe, expect, it } from "vitest";
import type { CatalogVisibilityPort } from "../catalog/catalog-visibility.policy.js";
import type { CatalogEntry } from "../catalog/catalog.types.js";
import { FeedbackService } from "./feedback.service.js";
import type { FeedbackRecord, FeedbackRepository } from "./feedback.types.js";

const employee: ActorContext = {
  employeeId: "E200",
  roleCodes: ["employee"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-employee",
};

const owner: ActorContext = {
  ...employee,
  employeeId: "E100",
  sessionId: "session-owner",
};

function catalogEntry(applicationId = "app-1"): CatalogEntry {
  return {
    applicationId,
    name: "平台助手",
    summary: "平台流程自动化",
    departmentId: "dept-platform",
    categoryId: "cat-productivity",
    tagIds: [],
    trustLabels: ["verified"],
    currentVersionId: "version-1",
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    deliveryChannels: ["web"],
    likeCount: 0,
    ratingAverage: null,
    healthStatus: "healthy",
    deprecatedReason: null,
    replacementApplicationId: null,
  };
}

const visibleCatalog: CatalogVisibilityPort = {
  requireVisible: async (_actor, applicationId) => catalogEntry(applicationId),
};

class MemoryFeedbackRepository implements FeedbackRepository {
  records: FeedbackRecord[] = [];
  audits: string[] = [];
  outbox: string[] = [];
  failOutbox = false;
  private nextId = 1;

  async withTransaction<T>(
    operation: (repository: FeedbackRepository) => Promise<T>,
  ): Promise<T> {
    const records = [...this.records];
    const audits = [...this.audits];
    const outbox = [...this.outbox];
    try {
      return await operation(this);
    } catch (error) {
      this.records = records;
      this.audits = audits;
      this.outbox = outbox;
      throw error;
    }
  }

  async findApplication(applicationId: string) {
    return applicationId === "app-1"
      ? {
          applicationId,
          ownerEmployeeId: owner.employeeId,
          maintainerEmployeeId: "E101",
        }
      : null;
  }

  async createFeedback(
    input: Omit<
      FeedbackRecord,
      "feedbackId" | "createdAt" | "updatedAt" | "resolvedAt"
    >,
  ) {
    const now = new Date();
    const record: FeedbackRecord = {
      ...input,
      feedbackId: `feedback-${this.nextId++}`,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    this.records.push(record);
    return record;
  }

  async listFeedbackByCreator(
    applicationId: string,
    creatorEmployeeId: string,
  ) {
    return this.records.filter(
      (record) =>
        record.applicationId === applicationId &&
        record.creatorEmployeeId === creatorEmployeeId,
    );
  }

  async listByApplication(applicationId: string) {
    return this.records.filter(
      (record) => record.applicationId === applicationId,
    );
  }

  async findFeedback(feedbackId: string) {
    return (
      this.records.find((record) => record.feedbackId === feedbackId) ?? null
    );
  }

  async updateFeedback(
    feedbackId: string,
    input: Partial<
      Pick<
        FeedbackRecord,
        "status" | "assigneeEmployeeId" | "resolution" | "resolvedAt"
      >
    >,
  ) {
    const existing = await this.findFeedback(feedbackId);
    if (existing === null) return null;
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.records[this.records.indexOf(existing)] = updated;
    return updated;
  }

  async recordAudit(input: { eventType: string }) {
    this.audits.push(input.eventType);
  }

  async emitOutbox(input: { eventType: string }) {
    if (this.failOutbox) throw new Error("OUTBOX_WRITE_FAILED");
    this.outbox.push(input.eventType);
  }
}

describe("FeedbackService", () => {
  it("creates feedback, audit and Outbox atomically for a visible application", async () => {
    const repository = new MemoryFeedbackRepository();
    const service = new FeedbackService(repository, visibleCatalog);

    await expect(
      service.createFeedback(employee, {
        applicationId: "app-1",
        type: "suggestion",
        body: "  增加批量处理能力  ",
      }),
    ).resolves.toMatchObject({
      applicationVersionId: "version-1",
      body: "增加批量处理能力",
      status: "open",
    });
    expect(repository.audits).toEqual(["feedback.created"]);
    expect(repository.outbox).toEqual(["feedback.created"]);
  });

  it("rolls back the feedback row and audit when Outbox persistence fails", async () => {
    const repository = new MemoryFeedbackRepository();
    repository.failOutbox = true;
    const service = new FeedbackService(repository, visibleCatalog);

    await expect(
      service.createFeedback(employee, {
        applicationId: "app-1",
        type: "bug",
        body: "无法打开",
      }),
    ).rejects.toThrow("OUTBOX_WRITE_FAILED");
    expect(repository.records).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
  });

  it("rejects feedback for a direct-ID application outside the actor audience", async () => {
    const repository = new MemoryFeedbackRepository();
    const hiddenCatalog: CatalogVisibilityPort = {
      requireVisible: async () => {
        throw new Error("CATALOG_APPLICATION_NOT_FOUND");
      },
    };
    const service = new FeedbackService(repository, hiddenCatalog);

    await expect(
      service.createFeedback(employee, {
        applicationId: "app-1",
        type: "bug",
        body: "不可见资源",
      }),
    ).rejects.toThrow("CATALOG_APPLICATION_NOT_FOUND");
    expect(repository.records).toHaveLength(0);
  });

  it("keeps terminal feedback fields consistent with database constraints", async () => {
    const repository = new MemoryFeedbackRepository();
    const service = new FeedbackService(repository, visibleCatalog);
    const created = await service.createFeedback(employee, {
      applicationId: "app-1",
      type: "content_issue",
      body: "文档过期",
    });

    await expect(
      service.updateFeedbackStatus(owner, {
        applicationId: "app-1",
        feedbackId: created.feedbackId,
        status: "resolved",
      }),
    ).rejects.toThrow("FEEDBACK_RESOLUTION_REQUIRED");

    const resolved = await service.updateFeedbackStatus(owner, {
      applicationId: "app-1",
      feedbackId: created.feedbackId,
      status: "resolved",
      resolution: "已更新文档",
    });
    expect(resolved.resolution).toBe("已更新文档");
    expect(resolved.resolvedAt).not.toBeNull();

    const reopened = await service.updateFeedbackStatus(owner, {
      applicationId: "app-1",
      feedbackId: created.feedbackId,
      status: "in_progress",
    });
    expect(reopened.resolution).toBeNull();
    expect(reopened.resolvedAt).toBeNull();
  });

  it("records feedback_submitted and feedback_resolved behavior events", async () => {
    const repository = new MemoryFeedbackRepository();
    const recorded: Array<{ eventName: string; aggregateId: string }> = [];
    const service = new FeedbackService(repository, visibleCatalog, {
      record: async (_actor, input) => {
        recorded.push({
          eventName: input.eventName,
          aggregateId: input.aggregateId,
        });
        return { inserted: true };
      },
    });
    const created = await service.createFeedback(employee, {
      applicationId: "app-1",
      type: "bug",
      body: "事件冒烟",
    });
    await service.updateFeedbackStatus(owner, {
      applicationId: "app-1",
      feedbackId: created.feedbackId,
      status: "resolved",
      resolution: "已修复",
    });

    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({
      eventName: "feedback_submitted",
      aggregateId: created.feedbackId,
    });
    expect(recorded[1]).toMatchObject({
      eventName: "feedback_resolved",
      aggregateId: created.feedbackId,
    });
  });

  it("only exposes the full feedback list to owner or maintainer", async () => {
    const repository = new MemoryFeedbackRepository();
    const service = new FeedbackService(repository, visibleCatalog);
    await service.createFeedback(employee, {
      applicationId: "app-1",
      type: "bug",
      body: "冒烟反馈",
    });

    await expect(
      service.listApplicationFeedback(employee, "app-1"),
    ).rejects.toThrow("OFFICIAL_FEEDBACK_VIEW_FORBIDDEN");
    await expect(
      service.listApplicationFeedback(owner, "app-1"),
    ).resolves.toHaveLength(1);
  });
});
