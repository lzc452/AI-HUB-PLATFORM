import { describe, expect, it } from "vitest";
import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";
import { InteractionService } from "./interaction.service.js";
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
    this.liked.add(`${applicationId}:${employeeId}`);
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

describe("InteractionService", () => {
  it("toggles a like without creating duplicate rows", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(repository, { authorize: allowAll });

    await expect(service.toggleLike(employee, "app-1")).resolves.toMatchObject({
      liked: true,
    });
    await expect(service.toggleLike(employee, "app-1")).resolves.toMatchObject({
      liked: false,
    });
    expect(repository.liked.size).toBe(0);
  });

  it("validates a rating and updates the employee's single application rating", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(repository, { authorize: allowAll });

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

  it("allows only the application team to create an official one-level reply", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(repository, { authorize: allowAll });

    await expect(
      service.reply(employee, {
        applicationId: "app-1",
        parentCommentId: null,
        body: "reply",
      }),
    ).rejects.toThrow("OFFICIAL_REPLY_FORBIDDEN");
    const comment = await service.reply(owner, {
      applicationId: "app-1",
      parentCommentId: null,
      body: "official",
    });
    expect(comment.authorEmployeeId).toBe("E100");
    await expect(
      service.reply(owner, {
        applicationId: "app-1",
        parentCommentId: comment.commentId,
        body: "second",
      }),
    ).resolves.toBeDefined();
    const child = repository.comments[1]!;
    repository.comments.push({
      ...child,
      commentId: "grandparent",
      parentCommentId: child.commentId,
    });
    await expect(
      service.reply(owner, {
        applicationId: "app-1",
        parentCommentId: "grandparent",
        body: "third",
      }),
    ).rejects.toThrow("COMMENT_DEPTH_EXCEEDED");
  });

  it("keeps reports non-destructive and audits anonymous identity lookup", async () => {
    const repository = new MemoryInteractionRepository();
    const service = new InteractionService(repository, { authorize: allowAll });
    const comment = await service.reply(owner, {
      applicationId: "app-1",
      parentCommentId: null,
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
});
