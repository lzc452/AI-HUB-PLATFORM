import { describe, expect, it, vi } from "vitest";
import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";
import { InteractionService } from "./interaction.service.js";
import type { CatalogVisibilityPort } from "../catalog/catalog-visibility.policy.js";
import type { CatalogEntry } from "../catalog/catalog.types.js";
import type {
  CommentRecord,
  InteractionRepository,
  RatingRecord,
  ReportRecord,
} from "./interaction.types.js";

const owner: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-owner",
};
const employee: ActorContext = {
  ...owner,
  employeeId: "E200",
  sessionId: "session-employee",
};
const admin: ActorContext = {
  ...owner,
  employeeId: "E300",
  roleCodes: ["application_admin", "super_admin"],
  sessionId: "session-admin",
};

class MemoryInteractionRepository implements InteractionRepository {
  liked = new Set<string>();
  likeIds = new Map<string, string>();
  ratings: RatingRecord[] = [];
  comments: CommentRecord[] = [];
  reports: ReportRecord[] = [];
  audits: string[] = [];
  nextId = 1;

  async withTransaction<T>(
    operation: (repository: InteractionRepository) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
  async findApplication(applicationId: string) {
    return applicationId === "app-1"
      ? {
          applicationId,
          ownerEmployeeId: "E100",
          maintainerEmployeeId: "E101",
        }
      : null;
  }
  async findCurrentVersionId() {
    return "version-1";
  }
  async hasLike(applicationId: string, employeeId: string) {
    return this.liked.has(`${applicationId}:${employeeId}`);
  }
  async addLike(applicationId: string, employeeId: string) {
    const key = `${applicationId}:${employeeId}`;
    if (this.liked.has(key)) {
      // 预置行（并发插入冲突）：返回已存在行的 like id，与真实仓库冲突路径一致
      return this.likeIds.get(key) ?? `like-${applicationId}-${employeeId}`;
    }
    this.liked.add(key);
    const likeId = `like-${applicationId}-${employeeId}`;
    this.likeIds.set(key, likeId);
    return likeId;
  }
  async removeLike(applicationId: string, employeeId: string) {
    this.liked.delete(`${applicationId}:${employeeId}`);
  }
  async upsertRating(
    input: Omit<RatingRecord, "ratingId" | "createdAt" | "updatedAt">,
  ) {
    const current = this.ratings.find(
      (rating) =>
        rating.applicationId === input.applicationId &&
        rating.employeeId === input.employeeId,
    );
    const rating = {
      ...(current ?? {}),
      ...input,
      ratingId: current?.ratingId ?? `rating-${this.nextId++}`,
      createdAt: current?.createdAt ?? new Date(),
      updatedAt: new Date(),
    } as RatingRecord;
    if (current === undefined) this.ratings.push(rating);
    else this.ratings[this.ratings.indexOf(current)] = rating;
    return rating;
  }
  async findComment(commentId: string) {
    return (
      this.comments.find((comment) => comment.commentId === commentId) ?? null
    );
  }
  async createComment(
    input: Omit<CommentRecord, "commentId" | "createdAt" | "updatedAt">,
  ) {
    const comment = {
      ...input,
      commentId: `comment-${this.nextId++}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.comments.push(comment);
    return comment;
  }
  async createReport(input: Omit<ReportRecord, "reportId" | "createdAt">) {
    const report = {
      ...input,
      reportId: `report-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.reports.push(report);
    return report;
  }
  async findReport(reportId: string) {
    return (
      this.reports.find((candidate) => candidate.reportId === reportId) ?? null
    );
  }
  async resolveReport(
    reportId: string,
    status: ReportRecord["status"],
    employeeId: string,
  ) {
    const report = this.reports.find(
      (candidate) => candidate.reportId === reportId,
    );
    if (report === undefined) throw new Error("REPORT_NOT_FOUND");
    const updated = {
      ...report,
      status,
      resolvedByEmployeeId: employeeId,
      resolvedAt: new Date(),
    };
    this.reports[this.reports.indexOf(report)] = updated;
    return updated;
  }
  async recordAudit(input: { eventType: string }) {
    this.audits.push(input.eventType);
  }

  async listRatings(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }) {
    const filtered = this.ratings.filter(
      (r) => r.applicationId === input.applicationId,
    );
    const paged = filtered.slice(
      (input.page - 1) * input.pageSize,
      input.page * input.pageSize,
    );
    return { items: paged, total: filtered.length };
  }

  async listComments(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }) {
    const roots = this.comments.filter(
      (c) =>
        c.applicationId === input.applicationId && c.parentCommentId === null,
    );
    const paged = roots.slice(
      (input.page - 1) * input.pageSize,
      input.page * input.pageSize,
    );
    const rootIds = new Set(paged.map((c) => c.commentId));
    const replies = this.comments.filter((c) =>
      rootIds.has(c.parentCommentId ?? ""),
    );
    return { items: [...paged, ...replies], total: roots.length };
  }

  async hideComment(commentId: string) {
    const comment = this.comments.find((c) => c.commentId === commentId);
    if (comment === undefined) throw new Error("COMMENT_NOT_FOUND");
    const updated = { ...comment, hiddenAt: new Date() };
    this.comments[this.comments.indexOf(comment)] = updated;
    return updated;
  }

  async restoreComment(commentId: string) {
    const comment = this.comments.find((c) => c.commentId === commentId);
    if (comment === undefined) throw new Error("COMMENT_NOT_FOUND");
    const updated = { ...comment, hiddenAt: null };
    this.comments[this.comments.indexOf(comment)] = updated;
    return updated;
  }
}

const allowAll = async (): Promise<AuthorizationDecision> => ({
  allowed: true,
  reasonCode: "ALLOW_TEST",
});

const visibleCatalog: CatalogVisibilityPort = {
  requireVisible: async (_actor: ActorContext, applicationId: string) => {
    if (applicationId !== "app-1") {
      throw new Error("CATALOG_APPLICATION_NOT_FOUND");
    }
    const entry: CatalogEntry = {
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
      myRating: null,
      likedByMe: false,
      healthStatus: "healthy",
      deprecatedReason: null,
      replacementApplicationId: null,
    };
    return entry;
  },
  requireVisibleOrManageable: async () => {},
};

// 非发布态、但由 owner 拥有的应用：requireVisible 抛错，requireVisibleOrManageable 仅对 owner 放行
const ownedHiddenCatalog: CatalogVisibilityPort = {
  requireVisible: async () => {
    throw new Error("CATALOG_APPLICATION_NOT_FOUND");
  },
  requireVisibleOrManageable: async (actor) => {
    if (actor.employeeId === owner.employeeId) return;
    throw new Error("CATALOG_APPLICATION_NOT_FOUND");
  },
};

describe("InteractionService", () => {
  it("toggles a like without creating duplicate rows", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
    );

    await expect(service.toggleLike(employee, "app-1")).resolves.toMatchObject({
      liked: true,
    });
    await expect(service.toggleLike(employee, "app-1")).resolves.toMatchObject({
      liked: false,
    });
    expect(repository.liked.size).toBe(0);
  });

  it("uses a stable idempotency key derived from the like row id", async () => {
    const repository = new MemoryInteractionRepository();
    const recorded: string[] = [];
    const actor: ActorContext = {
      ...employee,
      employeeId: "DEMO-EMPLOYEE",
      sessionId: "session-demo",
    };
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
      {
        record: async (_actor, input) => {
          recorded.push(input.idempotencyKey);
          return { inserted: true };
        },
      },
    );
    await service.toggleLike(actor, "app-1");
    expect(recorded[0]).toBe("application-liked:like-app-1-DEMO-EMPLOYEE");
  });

  it("returns the existing like row id on insert conflict instead of a degenerate key", async () => {
    const repository = new MemoryInteractionRepository();
    // 模拟并发双击：T1 已插入并提交（like id 与退化键不同），T2 的 addLike 命中唯一冲突
    repository.liked.add("app-1:E100");
    repository.likeIds.set("app-1:E100", "like-existing-1");

    // 冲突路径：返回已存在行的 like id，而非退化键 like-app-1-E100
    await expect(repository.addLike("app-1", "E100")).resolves.toBe(
      "like-existing-1",
    );
    // 同一行仍只有一条
    expect(repository.liked.size).toBe(1);
    // 无冲突路径：仍返回新行的 like id
    await expect(repository.addLike("app-2", "E100")).resolves.toBe(
      "like-app-2-E100",
    );
  });

  it("validates a rating and updates the employee's single application rating", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
    );

    await expect(
      service.rate(employee, { applicationId: "app-1", stars: 6, body: "bad" }),
    ).rejects.toThrow("RATING_STARS_INVALID");
    await service.rate(employee, {
      applicationId: "app-1",
      stars: 4,
      body: "good",
    });
    await service.rate(employee, {
      applicationId: "app-1",
      stars: 5,
      body: "great",
    });
    expect(repository.ratings).toHaveLength(1);
    expect(repository.ratings[0]?.stars).toBe(5);
  });

  it("allows any employee to create a root comment; only the team may reply", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
    );

    const root = await service.createComment(employee, {
      applicationId: "app-1",
      body: "普通用户的根评论",
    });
    expect(root.commentKind).toBe("user");

    await expect(
      service.replyComment(employee, {
        applicationId: "app-1",
        parentCommentId: root.commentId,
        body: "reply",
      }),
    ).rejects.toThrow("OFFICIAL_REPLY_FORBIDDEN");

    const official = await service.replyComment(owner, {
      applicationId: "app-1",
      parentCommentId: root.commentId,
      body: "official",
    });
    expect(official.commentKind).toBe("official");
    expect(official.authorEmployeeId).toBe("E100");
    await expect(
      service.replyComment(owner, {
        applicationId: "app-1",
        parentCommentId: official.commentId,
        body: "third",
      }),
    ).rejects.toThrow("COMMENT_DEPTH_EXCEEDED");
  });

  it("rejects empty comment bodies", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
    );

    await expect(
      service.createComment(employee, {
        applicationId: "app-1",
        body: "   ",
      }),
    ).rejects.toThrow("COMMENT_BODY_REQUIRED");
  });

  it("keeps reports non-destructive and audits anonymous identity lookup", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
    );
    const comment = await service.createComment(owner, {
      applicationId: "app-1",
      body: "content",
    });
    const report = await service.report(employee, {
      applicationId: "app-1",
      commentId: comment.commentId,
      reason: "policy",
    });
    await service.resolveReport(admin, report.reportId, "hidden");
    await expect(
      service.lookupAnonymousAuthor(admin, comment.commentId),
    ).resolves.toBe("E100");
    expect(repository.audits).toContain(
      "interaction.anonymous_identity.viewed",
    );
  });

  it("notifies the reporter when a report is resolved", async () => {
    const repository = new MemoryInteractionRepository();
    const notifications = { queue: vi.fn().mockResolvedValue(undefined) };
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
      undefined,
      notifications,
    );
    const comment = await service.createComment(owner, {
      applicationId: "app-1",
      body: "content",
    });
    const report = await service.report(employee, {
      applicationId: "app-1",
      commentId: comment.commentId,
      reason: "policy",
    });

    await service.resolveReport(admin, report.reportId, "hidden");

    expect(notifications.queue).toHaveBeenCalledWith(
      admin,
      "interaction.report.resolved",
      {
        recipientEmployeeId: employee.employeeId,
        aggregateId: "app-1",
      },
    );
  });

  it("resolves reports without a notification when the port is absent", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
    );
    const comment = await service.createComment(owner, {
      applicationId: "app-1",
      body: "content",
    });
    const report = await service.report(employee, {
      applicationId: "app-1",
      commentId: comment.commentId,
      reason: "policy",
    });

    await expect(
      service.resolveReport(admin, report.reportId, "dismissed"),
    ).resolves.toMatchObject({ status: "dismissed" });
  });

  it("keeps the report resolution committed when the notification queue fails", async () => {
    const repository = new MemoryInteractionRepository();
    const notifications = {
      queue: vi.fn().mockRejectedValue(new Error("NOT_AUTHORIZED")),
    };
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      visibleCatalog,
      undefined,
      notifications,
    );
    const comment = await service.createComment(owner, {
      applicationId: "app-1",
      body: "content",
    });
    const report = await service.report(employee, {
      applicationId: "app-1",
      commentId: comment.commentId,
      reason: "policy",
    });

    await expect(
      service.resolveReport(admin, report.reportId, "hidden"),
    ).resolves.toMatchObject({ status: "hidden" });

    expect(notifications.queue).toHaveBeenCalledWith(
      admin,
      "interaction.report.resolved",
      expect.anything(),
    );
  });

  it("rejects direct-ID interaction when the application is outside the actor audience", async () => {
    const repository = new MemoryInteractionRepository();
    const hiddenCatalog: CatalogVisibilityPort = {
      requireVisible: async () => {
        throw new Error("CATALOG_APPLICATION_NOT_FOUND");
      },
      requireVisibleOrManageable: async () => {
        throw new Error("CATALOG_APPLICATION_NOT_FOUND");
      },
    };
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      hiddenCatalog,
    );

    await expect(service.toggleLike(employee, "app-1")).rejects.toThrow(
      "CATALOG_APPLICATION_NOT_FOUND",
    );
    expect(repository.liked.size).toBe(0);
  });

  it("allows the owner to read comments of an owned non-published application", async () => {
    const repository = new MemoryInteractionRepository();
    await repository.createComment({
      applicationId: "app-1",
      applicationVersionId: "version-1",
      parentCommentId: null,
      authorEmployeeId: "E200",
      body: "草稿态根评论",
      displayAnonymously: false,
      commentKind: "user",
      hiddenAt: null,
    });
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      ownedHiddenCatalog,
    );

    await expect(
      service.listComments(owner, "app-1", 1, 20),
    ).resolves.toMatchObject({ total: 1 });
  });

  it("does not expose comments of a non-published application to regular employees", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      ownedHiddenCatalog,
    );

    await expect(
      service.listComments(employee, "app-1", 1, 20),
    ).rejects.toThrow("CATALOG_APPLICATION_NOT_FOUND");
  });

  it("allows the owner to reply to comments on an owned non-published application", async () => {
    const repository = new MemoryInteractionRepository();
    const root = await repository.createComment({
      applicationId: "app-1",
      applicationVersionId: "version-1",
      parentCommentId: null,
      authorEmployeeId: "E200",
      body: "草稿态根评论",
      displayAnonymously: false,
      commentKind: "user",
      hiddenAt: null,
    });
    const service = new InteractionService(
      repository,
      { authorize: allowAll },
      ownedHiddenCatalog,
    );

    const official = await service.replyComment(owner, {
      applicationId: "app-1",
      parentCommentId: root.commentId,
      body: "official",
    });
    expect(official.commentKind).toBe("official");
  });
});
