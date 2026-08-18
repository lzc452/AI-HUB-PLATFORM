import { describe, expect, it } from "vitest";
import type {
  ActorContext,
  AuthorizationDecision,
  DemandStatus,
} from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import { DemandService } from "./demand.service.js";
import type {
  DemandCommentRecord,
  DemandCollaboratorRecord,
  DemandEntry,
  DemandRepository,
} from "./demand.types.js";

const requester: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  permissions: [
    PERMISSIONS.DEMAND_CREATE,
    PERMISSIONS.DEMAND_READ,
    PERMISSIONS.DEMAND_UPDATE,
    PERMISSIONS.DEMAND_SUBMIT,
    PERMISSIONS.DEMAND_INTERACT,
  ],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-requester",
};
const reviewer: ActorContext = {
  employeeId: "E900",
  roleCodes: ["demand_reviewer"],
  permissions: [PERMISSIONS.DEMAND_READ, PERMISSIONS.DEMAND_REVIEW],
  departmentIds: ["dept-ops"],
  primaryDepartmentId: "dept-ops",
  sessionId: "session-reviewer",
};

const allowAll = async (): Promise<AuthorizationDecision> => ({
  allowed: true,
  reasonCode: "TEST_ALLOW",
});

function makeService(repository: DemandRepository) {
  return new DemandService(repository, { authorize: allowAll });
}

function baseDemand(demandId: string): DemandEntry {
  return {
    demandId,
    requesterEmployeeId: "E100",
    title: "协同知识助手",
    problemStatement: "团队需要统一、可追溯的内部知识查询能力。",
    desiredOutcome: "员工能在一分钟内获得经过审核的答案。",
    status: "pending_claim",
    audienceType: "all",
    audienceDepartmentId: null,
    displayAnonymously: false,
    reviewReason: null,
    likeCount: 0,
    commentCount: 0,
    priorityScore: null,
    priorityExplanation: null,
    ownerEmployeeId: null,
    primarySolutionApplicationId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("DemandService submission lifecycle", () => {
  it("creates a normalized draft and rejects incomplete structured input", async () => {
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      createDraft: async () =>
        ({
          demandId: "demand-1",
          requesterEmployeeId: "E100",
          title: "Internal knowledge assistant",
          problemStatement:
            "Teams cannot find approved internal guidance quickly.",
          desiredOutcome: "Return cited guidance in under one minute.",
          status: "draft",
          audienceType: "all",
          audienceDepartmentId: null,
          displayAnonymously: false,
          likeCount: 0,
          commentCount: 0,
          priorityScore: null,
          priorityExplanation: null,
          ownerEmployeeId: null,
          primarySolutionApplicationId: null,
          version: 1,
          reviewReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }) satisfies DemandEntry,
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = makeService(repository);

    const draft = await service.createDraft(requester, {
      title: "  Internal knowledge assistant  ",
      problemStatement: "Teams cannot find approved internal guidance quickly.",
      businessScenario:
        "Teams maintain guidance across many disconnected tools.",
      impact: "All engineers, daily, several minutes per lookup.",
      desiredOutcome: "Return cited guidance in under one minute.",
      currentWorkaround: "Manual search across wikis and shared drives.",
      dataSensitivity: "Internal documentation, low sensitivity.",
      audienceType: "all",
    });
    expect(draft.title).toBe("Internal knowledge assistant");

    await expect(
      service.createDraft(requester, {
        title: " ",
        problemStatement: "too short",
        businessScenario: "x",
        impact: "y",
        desiredOutcome: "too short",
        currentWorkaround: "z",
        dataSensitivity: "w",
        audienceType: "all",
      }),
    ).rejects.toThrow("DEMAND_FIELD_INVALID");
  });

  it("submits a draft, allows reviewer publication, and records rejection feedback", async () => {
    const demand: DemandEntry = {
      demandId: "demand-1",
      requesterEmployeeId: "E100",
      title: "Internal knowledge assistant",
      problemStatement: "Teams cannot find approved internal guidance quickly.",
      desiredOutcome: "Return cited guidance in under one minute.",
      status: "draft",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: false,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: null,
      primarySolutionApplicationId: null,
      version: 1,
      reviewReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const audits: string[] = [];
    const events: string[] = [];
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository),
      findById: async () => demand,
      transitionStatus: async (
        _id: string,
        status: DemandEntry["status"],
        _expectedVersion: number,
        reviewReason?: string | null,
      ) => {
        demand.status = status;
        demand.reviewReason = reviewReason ?? null;
        demand.version += 1;
        return demand;
      },
      recordAudit: async ({ eventType }: { eventType: string }) => {
        audits.push(eventType);
      },
      emitOutbox: async ({ eventType }: { eventType: string }) => {
        events.push(eventType);
      },
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await service.submitForReview(requester, demand.demandId);
    expect(demand.status).toBe("pending_review");
    await expect(
      service.review(requester, demand.demandId, "publish"),
    ).rejects.toThrow("DEMAND_REVIEW_FORBIDDEN");

    await service.review(
      reviewer,
      demand.demandId,
      "reject",
      "Clarify target users",
    );
    expect(demand).toMatchObject({
      status: "rejected",
      reviewReason: "Clarify target users",
    });
    expect(audits).toEqual(["demand.submitted", "demand.reviewed"]);
    expect(events).toEqual(["demand.submitted", "demand.reviewed"]);

    demand.status = "pending_review";
    await service.review(reviewer, demand.demandId, "publish");
    expect(demand.status).toBe("pending_claim");
  });
});

describe("DemandService innovation extension", () => {
  it("calculates the normalized one-to-five priority score", async () => {
    const demand = baseDemand("demand-normalized-priority");
    const operator: ActorContext = {
      ...requester,
      permissions: [
        ...(requester.permissions ?? []),
        PERMISSIONS.DEMAND_PRIORITIZE,
      ],
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      findById: async () => demand,
      setPriority: async (
        _demandId: string,
        input: Parameters<DemandRepository["setPriority"]>[1],
        _expectedVersion: number,
        score: number,
        explanation: string,
      ) => ({
        ...demand,
        ...input,
        priorityScore: score,
        priorityExplanation: explanation,
      }),
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;

    await expect(
      makeService(repository).setPriority(operator, demand.demandId, 1, {
        businessValue: 5,
        impactedHeadcount: 4,
        usageFrequency: 4,
        strategicFit: 4,
        technicalFeasibility: 4,
        dataComplianceRisk: 1,
        implementationCost: 2,
      }),
    ).resolves.toMatchObject({ priorityScore: 4.3 });
  });

  it("allows read users to sort the visible list by priority", async () => {
    const demand = baseDemand("demand-priority-list");
    const repository = {
      listVisible: async () => [demand],
    } as unknown as DemandRepository;

    await expect(
      makeService(repository).list(requester, {
        page: 1,
        pageSize: 6,
        sort: "priority",
      }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it("toggles a comment like and records the interaction", async () => {
    const demand = baseDemand("demand-comment-like");
    let liked = false;
    const events: string[] = [];
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      findVisible: async () => demand,
      findComment: async () => ({
        commentId: "comment-1",
        demandId: demand.demandId,
        parentCommentId: null,
        authorEmployeeId: "E200",
        body: "请补充试点范围。",
        displayAnonymously: false,
        hiddenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      hasCommentLike: async () => liked,
      addCommentLike: async () => {
        liked = true;
      },
      removeCommentLike: async () => {
        liked = false;
      },
      recordAudit: async ({ eventType }: { eventType: string }) => {
        events.push(eventType);
      },
      emitOutbox: async ({ eventType }: { eventType: string }) => {
        events.push(eventType);
      },
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await expect(
      service.toggleCommentLike(requester, demand.demandId, "comment-1"),
    ).resolves.toEqual({ liked: true });
    expect(events).toEqual(["demand.comment.liked", "demand.comment.liked"]);
  });

  it("masks anonymous requester display information for other readers", async () => {
    const demand = {
      ...baseDemand("demand-anonymous-projection"),
      displayAnonymously: true,
      requesterEmployeeId: "E200",
      requesterDisplayName: "匿名发起人",
      requesterDepartmentId: "dept-ops",
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      findVisible: async () => demand,
    } as unknown as DemandRepository;

    await expect(
      makeService(repository).getDetail(requester, demand.demandId),
    ).resolves.toMatchObject({
      requesterEmployeeId: null,
      requesterDisplayName: null,
      requesterDepartmentId: null,
    });
  });

  it("rejects likes on a hidden comment before recording an interaction", async () => {
    const demand = baseDemand("demand-hidden-comment");
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      findVisible: async () => demand,
      findComment: async () => ({
        commentId: "comment-hidden",
        demandId: demand.demandId,
        parentCommentId: null,
        authorEmployeeId: "E200",
        body: "已隐藏的内容。",
        displayAnonymously: false,
        hiddenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      hasCommentLike: async () => false,
      addCommentLike: async () => undefined,
      removeCommentLike: async () => undefined,
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;

    await expect(
      makeService(repository).toggleCommentLike(
        requester,
        demand.demandId,
        "comment-hidden",
      ),
    ).rejects.toThrow("DEMAND_COMMENT_HIDDEN");
  });

  it("does not remove the demand owner from collaborators", async () => {
    const demand = {
      ...baseDemand("demand-owner-removal"),
      ownerEmployeeId: "E100",
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      findById: async () => demand,
      removeCollaborator: async () => undefined,
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;

    await expect(
      makeService(repository).removeCollaborator(
        requester,
        demand.demandId,
        "E100",
        1,
      ),
    ).rejects.toThrow("DEMAND_OWNER_COLLABORATOR_PROTECTED");
  });

  it("updates a collaborator role with optimistic versioning and audit events", async () => {
    const demand = {
      ...baseDemand("demand-collaborator-role"),
      ownerEmployeeId: requester.employeeId,
      version: 7,
    };
    const events: string[] = [];
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      findById: async () => demand,
      updateCollaboratorRole: async (
        _demandId: string,
        employeeId: string,
        role: DemandCollaboratorRecord["role"],
        expectedVersion: number,
      ) => {
        if (expectedVersion !== demand.version)
          throw new Error("DEMAND_CONFLICT");
        demand.version += 1;
        return {
          demandId: demand.demandId,
          employeeId,
          role,
          createdAt: new Date(),
        };
      },
      recordAudit: async ({ eventType }: { eventType: string }) => {
        events.push(eventType);
      },
      emitOutbox: async ({ eventType }: { eventType: string }) => {
        events.push(eventType);
      },
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await expect(
      service.updateCollaboratorRole(
        requester,
        demand.demandId,
        "E200",
        "operator",
        7,
      ),
    ).resolves.toMatchObject({ employeeId: "E200", role: "operator" });
    expect(events).toEqual([
      "demand.collaborator.role.updated",
      "demand.collaborator.role.updated",
    ]);
    await expect(
      service.updateCollaboratorRole(
        requester,
        demand.demandId,
        "E200",
        "collaborator",
        7,
      ),
    ).rejects.toThrow("DEMAND_CONFLICT");
  });

  it("rejects resolving a report through a different demand URL", async () => {
    const moderator: ActorContext = {
      ...requester,
      permissions: [
        ...(requester.permissions ?? []),
        PERMISSIONS.DEMAND_MODERATE,
      ],
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as DemandRepository),
      findReport: async () => ({
        reportId: "report-1",
        demandId: "demand-b",
        commentId: null,
        reporterEmployeeId: "E200",
        reason: "需要处理",
        status: "open" as const,
        resolvedByEmployeeId: null,
        resolvedAt: null,
        createdAt: new Date(),
      }),
      resolveReport: async () => ({
        reportId: "report-1",
        demandId: "demand-b",
        commentId: null,
        reporterEmployeeId: "E200",
        reason: "需要处理",
        status: "dismissed" as const,
        resolvedByEmployeeId: "E100",
        resolvedAt: new Date(),
        createdAt: new Date(),
      }),
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;

    await expect(
      makeService(repository).resolveReport(
        moderator,
        "demand-a",
        "report-1",
        "dismissed",
      ),
    ).rejects.toThrow("DEMAND_RESOURCE_MISMATCH");
  });

  it("rejects anonymous-author lookup through a different demand URL", async () => {
    const auditor: ActorContext = {
      ...requester,
      permissions: [
        ...(requester.permissions ?? []),
        PERMISSIONS.DEMAND_ANONYMOUS_AUDIT,
      ],
    };
    const repository = {
      findComment: async () => ({
        commentId: "comment-cross-demand",
        demandId: "demand-b",
        parentCommentId: null,
        authorEmployeeId: "E200",
        body: "匿名评论。",
        displayAnonymously: true,
        hiddenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      recordAudit: async () => undefined,
    } as unknown as DemandRepository;

    await expect(
      makeService(repository).lookupAnonymousAuthor(
        auditor,
        "demand-a",
        "comment-cross-demand",
      ),
    ).rejects.toThrow("DEMAND_RESOURCE_MISMATCH");
  });
});

describe("DemandService innovation-square interactions", () => {
  it("filters by repository audience, masks anonymous identity, and toggles likes idempotently", async () => {
    const demand = {
      demandId: "demand-public",
      requesterEmployeeId: "E100",
      title: "Public demand",
      problemStatement: "Teams need a governed internal assistant.",
      desiredOutcome: "A reviewed assistant is available to every team.",
      status: "pending_claim" as const,
      audienceType: "all" as const,
      audienceDepartmentId: null,
      displayAnonymously: true,
      reviewReason: null,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: null,
      primarySolutionApplicationId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let liked = false;
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      listVisible: async () => [demand],
      findVisible: async () => demand,
      hasLike: async () => liked,
      addLike: async () => {
        liked = true;
      },
      removeLike: async () => {
        liked = false;
      },
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = makeService(repository);

    const list = await service.list(requester, { page: 1, pageSize: 20 });
    expect(list.items).toHaveLength(1);
    expect(
      (await service.getDetail(reviewer, demand.demandId)).requesterEmployeeId,
    ).toBe(null);
    expect(await service.toggleLike(requester, demand.demandId)).toEqual({
      liked: true,
    });
    expect(await service.toggleLike(requester, demand.demandId)).toEqual({
      liked: false,
    });
  });

  it("creates one-level discussion and preserves real identity for authorized anonymous audit", async () => {
    const comment: DemandCommentRecord = {
      commentId: "comment-1",
      demandId: "demand-public",
      parentCommentId: null,
      authorEmployeeId: "E100",
      body: "Please include source links.",
      displayAnonymously: true,
      hiddenAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const audits: string[] = [];
    const outboxCalls: Array<{ eventType: string; idempotencyKey?: string }> = [];
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      findVisible: async () => ({
        demandId: "demand-public",
        requesterEmployeeId: "E100",
        title: "Public demand",
        problemStatement: "Teams need a governed internal assistant.",
        desiredOutcome: "A reviewed assistant is available to every team.",
        status: "pending_claim" as const,
        audienceType: "all" as const,
        audienceDepartmentId: null,
        displayAnonymously: false,
        reviewReason: null,
        likeCount: 0,
        commentCount: 0,
        priorityScore: null,
        priorityExplanation: null,
        ownerEmployeeId: null,
        primarySolutionApplicationId: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findComment: async () => comment,
      createComment: async () => comment,
      recordAudit: async ({ eventType }: { eventType: string }) => {
        audits.push(eventType);
      },
      emitOutbox: async (input: {
        eventType: string;
        idempotencyKey?: string;
      }) => {
        outboxCalls.push(input);
      },
    } as unknown as DemandRepository;
    const service = new DemandService(repository, { authorize: allowAll });

    await service.addComment(requester, {
      demandId: "demand-public",
      parentCommentId: null,
      body: "Please include source links.",
      displayAnonymously: true,
    });
    // 低危-6/7：emitOutbox 必须携带稳定的业务幂等键（含实体 ID），使 outbox 唯一索引去重生效。
    expect(outboxCalls[0]?.idempotencyKey).toContain("comment-1");
    comment.parentCommentId = "comment-root";
    await expect(
      service.addComment(requester, {
        demandId: "demand-public",
        parentCommentId: "comment-1",
        body: "A nested reply is not allowed.",
      }),
    ).rejects.toThrow("DEMAND_COMMENT_DEPTH_EXCEEDED");
    await expect(
      service.lookupAnonymousAuthor(reviewer, "demand-public", "comment-1"),
    ).resolves.toBe("E100");
    expect(audits).toContain("demand.anonymous_identity.viewed");
  });

  it("hides and restores reported comments without deleting them", async () => {
    const operator: ActorContext = {
      ...reviewer,
      roleCodes: ["demand_operator"],
      permissions: [
        PERMISSIONS.DEMAND_CREATE,
        PERMISSIONS.DEMAND_READ,
        PERMISSIONS.DEMAND_UPDATE,
        PERMISSIONS.DEMAND_SUBMIT,
        PERMISSIONS.DEMAND_REVIEW,
        PERMISSIONS.DEMAND_CLAIM,
        PERMISSIONS.DEMAND_COLLABORATE,
        PERMISSIONS.DEMAND_PRIORITIZE,
        PERMISSIONS.DEMAND_PROGRESS,
        PERMISSIONS.DEMAND_MERGE,
        PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION,
        PERMISSIONS.DEMAND_INTERACT,
        PERMISSIONS.DEMAND_MODERATE,
        PERMISSIONS.DEMAND_ANONYMOUS_AUDIT,
      ],
    };
    let hiddenAt: Date | null = null;
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      resolveReport: async () => ({
        reportId: "report-1",
        demandId: "demand-public",
        commentId: "comment-1",
        reporterEmployeeId: "E100",
        reason: "Needs review",
        status: "hidden" as const,
        resolvedByEmployeeId: "E900",
        resolvedAt: new Date(),
        createdAt: new Date(),
      }),
      findReport: async () => ({
        reportId: "report-1",
        demandId: "demand-public",
        commentId: "comment-1",
        reporterEmployeeId: "E100",
        reason: "Needs review",
        status: "open" as const,
        resolvedByEmployeeId: null,
        resolvedAt: null,
        createdAt: new Date(),
      }),
      setCommentHidden: async (_commentId: string, value: Date | null) => {
        hiddenAt = value;
      },
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = new DemandService(repository, { authorize: allowAll });

    await service.resolveReport(
      operator,
      "demand-public",
      "report-1",
      "hidden",
    );
    expect(hiddenAt).toBeInstanceOf(Date);
    await service.resolveReport(
      operator,
      "demand-public",
      "report-1",
      "restored",
    );
    expect(hiddenAt).toBeNull();
  });
});

describe("DemandService ownership and collaboration", () => {
  it("keeps the first claim and rejects a stale concurrent claimant", async () => {
    const demand: DemandEntry = {
      demandId: "demand-claim",
      requesterEmployeeId: "E100",
      title: "Claimable demand",
      problemStatement: "A team needs a governed assistant.",
      desiredOutcome: "A reviewed assistant is delivered.",
      status: "pending_claim",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: false,
      reviewReason: null,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: null,
      primarySolutionApplicationId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      findById: async () => demand,
      claimOwner: async (
        _demandId: string,
        employeeId: string,
        expectedVersion: number,
      ) => {
        if (
          demand.version !== expectedVersion ||
          demand.ownerEmployeeId !== null
        ) {
          throw new Error("DEMAND_CONFLICT");
        }
        demand.ownerEmployeeId = employeeId;
        demand.version += 1;
        return demand;
      },
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await expect(
      service.claim(requester, demand.demandId, 1),
    ).resolves.toMatchObject({
      ownerEmployeeId: "E100",
      version: 2,
    });
    await expect(service.claim(reviewer, demand.demandId, 1)).rejects.toThrow(
      "DEMAND_CONFLICT",
    );
  });

  it("allows only the owner to add unique collaborators and operators", async () => {
    const demand: DemandEntry = {
      demandId: "demand-collaborators",
      requesterEmployeeId: "E100",
      title: "Collaborative demand",
      problemStatement: "A team needs a governed assistant.",
      desiredOutcome: "A reviewed assistant is delivered.",
      status: "pending_claim",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: false,
      reviewReason: null,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: "E100",
      primarySolutionApplicationId: null,
      version: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const collaborators = new Set<string>();
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      findById: async () => demand,
      findVisible: async () => demand,
      assignCollaborator: async (
        _demandId: string,
        employeeId: string,
        role: DemandCollaboratorRecord["role"],
        expectedVersion: number,
      ) => {
        if (demand.version !== expectedVersion)
          throw new Error("DEMAND_CONFLICT");
        if (collaborators.has(employeeId)) {
          throw new Error("DEMAND_COLLABORATOR_DUPLICATE");
        }
        collaborators.add(employeeId);
        demand.version += 1;
        return {
          demandId: demand.demandId,
          employeeId,
          role,
          createdAt: new Date(),
        };
      },
      listCollaborators: async () => [
        {
          demandId: demand.demandId,
          employeeId: "E200",
          role: "collaborator" as const,
          createdAt: new Date(),
        },
      ],
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await expect(
      service.addCollaborator(
        requester,
        demand.demandId,
        "E200",
        "collaborator",
        4,
      ),
    ).resolves.toMatchObject({ employeeId: "E200", role: "collaborator" });
    await expect(
      service.addCollaborator(
        requester,
        demand.demandId,
        "E200",
        "collaborator",
        5,
      ),
    ).rejects.toThrow("DEMAND_COLLABORATOR_DUPLICATE");
    await expect(
      service.addCollaborator(reviewer, demand.demandId, "E300", "operator", 5),
    ).rejects.toThrow("DEMAND_OWNER_REQUIRED");
    await expect(
      service.listCollaborators(requester, demand.demandId),
    ).resolves.toMatchObject([{ employeeId: "E200", role: "collaborator" }]);
  });
});

describe("DemandService explainable priority", () => {
  it("bounds priority inputs, persists a deterministic explanation, and restricts admin changes", async () => {
    const demand: DemandEntry = {
      demandId: "demand-priority",
      requesterEmployeeId: "E100",
      title: "Prioritizable demand",
      problemStatement: "A team needs a governed assistant.",
      desiredOutcome: "A reviewed assistant is delivered.",
      status: "pending_claim",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: false,
      reviewReason: null,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: null,
      primarySolutionApplicationId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const operator: ActorContext = {
      ...reviewer,
      roleCodes: ["demand_operator"],
      permissions: [
        PERMISSIONS.APPLICATION_CREATE,
        PERMISSIONS.DEMAND_READ,
        PERMISSIONS.DEMAND_PRIORITIZE,
        PERMISSIONS.DEMAND_PROGRESS,
        PERMISSIONS.DEMAND_MERGE,
        PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION,
      ],
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      findById: async () => demand,
      setPriority: async (
        _demandId: string,
        input: {
          businessValue: number;
          impactedHeadcount: number;
          usageFrequency: number;
          strategicFit: number;
          technicalFeasibility: number;
          dataComplianceRisk: number;
          implementationCost: number;
        },
        expectedVersion: number,
        score: number,
        explanation: string,
      ) => {
        if (expectedVersion !== demand.version)
          throw new Error("DEMAND_CONFLICT");
        demand.businessValue = input.businessValue;
        demand.impactedHeadcount = input.impactedHeadcount;
        demand.usageFrequency = input.usageFrequency;
        demand.strategicFit = input.strategicFit;
        demand.technicalFeasibility = input.technicalFeasibility;
        demand.dataComplianceRisk = input.dataComplianceRisk;
        demand.implementationCost = input.implementationCost;
        demand.priorityScore = score;
        demand.priorityExplanation = explanation;
        demand.version += 1;
        return demand;
      },
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await expect(
      service.setPriority(operator, demand.demandId, 1, {
        businessValue: 5,
        impactedHeadcount: 4,
        usageFrequency: 4,
        strategicFit: 4,
        technicalFeasibility: 4,
        dataComplianceRisk: 1,
        implementationCost: 2,
      }),
    ).resolves.toMatchObject({ priorityScore: 4.3 });
    expect(demand.priorityExplanation).toContain("businessValue=5");
    await expect(
      service.setPriority(requester, demand.demandId, 2, {
        businessValue: 6,
        impactedHeadcount: 4,
        usageFrequency: 4,
        strategicFit: 4,
        technicalFeasibility: 4,
        dataComplianceRisk: 1,
        implementationCost: 2,
      }),
    ).rejects.toThrow("DEMAND_PRIORITY_FORBIDDEN");
  });
});

describe("DemandService progress and pilot lifecycle", () => {
  it("enforces the status graph and records official progress and pilot changes", async () => {
    const demand: DemandEntry = {
      demandId: "demand-progress",
      requesterEmployeeId: "E100",
      title: "Progress demand",
      problemStatement: "A team needs a governed assistant.",
      desiredOutcome: "A reviewed assistant is delivered.",
      status: "pending_claim",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: false,
      reviewReason: null,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: "E100",
      primarySolutionApplicationId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const operator: ActorContext = {
      ...reviewer,
      roleCodes: ["demand_operator"],
      permissions: [
        PERMISSIONS.DEMAND_READ,
        PERMISSIONS.DEMAND_PROGRESS,
        PERMISSIONS.DEMAND_MERGE,
        PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION,
      ],
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      findById: async () => demand,
      transitionStatus: async (
        _demandId: string,
        status: DemandStatus,
        expectedVersion: number,
      ) => {
        if (expectedVersion !== demand.version)
          throw new Error("DEMAND_CONFLICT");
        demand.status = status;
        demand.version += 1;
        return demand;
      },
      createProgressUpdate: async (input: {
        demandId: string;
        authorEmployeeId: string;
        status: DemandStatus;
        title: string;
        body: string;
      }) => ({ progressId: "progress-1", ...input, createdAt: new Date() }),
      listProgressUpdates: async () => [],
      createPilot: async (input: Record<string, unknown>) => ({
        pilotId: "pilot-1",
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updatePilot: async (pilotId: string, input: Record<string, unknown>) => ({
        pilotId,
        demandId: demand.demandId,
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await expect(
      service.advanceStatus(operator, demand.demandId, 1, "claimed"),
    ).resolves.toMatchObject({ status: "claimed", version: 2 });
    await expect(
      service.advanceStatus(operator, demand.demandId, 2, "pending_claim"),
    ).rejects.toThrow("DEMAND_STATUS_TRANSITION_INVALID");
    await expect(
      service.addProgressUpdate(operator, demand.demandId, {
        title: "Implementation started",
        body: "The first governed workflow is being tested.",
      }),
    ).resolves.toMatchObject({ status: "claimed" });
    await expect(
      service.createPilot(operator, demand.demandId, {
        name: "R&D pilot",
        startsAt: new Date("2026-08-10"),
        endsAt: new Date("2026-08-20"),
      }),
    ).resolves.toMatchObject({ status: "planned" });
  });
});

describe("DemandService merge and application links", () => {
  it("merges with optimistic protection and allows one primary solution link", async () => {
    const source: DemandEntry = {
      demandId: "demand-source",
      requesterEmployeeId: "E100",
      title: "Duplicate demand",
      problemStatement: "A team needs a governed assistant.",
      desiredOutcome: "A reviewed assistant is delivered.",
      status: "pending_claim",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: false,
      reviewReason: null,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: "E100",
      primarySolutionApplicationId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const target: DemandEntry = {
      ...source,
      demandId: "demand-target",
      title: "Canonical demand",
      version: 2,
    };
    const operator: ActorContext = {
      ...reviewer,
      roleCodes: ["demand_operator"],
      permissions: [
        PERMISSIONS.DEMAND_READ,
        PERMISSIONS.DEMAND_PROGRESS,
        PERMISSIONS.DEMAND_MERGE,
        PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION,
      ],
    };
    const repository = {
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      findById: async (demandId: string) =>
        demandId === source.demandId ? source : target,
      mergeDemands: async (
        sourceDemandId: string,
        targetDemandId: string,
        sourceVersion: number,
        targetVersion: number,
      ) => {
        if (
          sourceVersion !== source.version ||
          targetVersion !== target.version
        ) {
          throw new Error("DEMAND_CONFLICT");
        }
        source.status = "merged";
        source.version += 1;
        target.version += 1;
        return { source, target };
      },
      linkApplication: async (
        demandId: string,
        applicationId: string,
        role: "candidate" | "pilot" | "solution",
        isPrimary: boolean,
        expectedVersion: number,
        linkedByEmployeeId: string,
      ) => {
        if (expectedVersion !== target.version)
          throw new Error("DEMAND_CONFLICT");
        target.version += 1;
        return {
          demandId,
          applicationId,
          role,
          isPrimary,
          linkedByEmployeeId,
          createdAt: new Date(),
        };
      },
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = makeService(repository);

    await expect(
      service.merge(operator, source.demandId, target.demandId, 1, 2),
    ).resolves.toMatchObject({ source: { status: "merged" } });
    await expect(
      service.linkApplication(
        operator,
        target.demandId,
        "application-1",
        "solution",
        true,
        3,
      ),
    ).resolves.toMatchObject({ isPrimary: true, role: "solution" });
  });

  it("creates a draft application through the application lifecycle bridge", async () => {
    const operator: ActorContext = {
      ...reviewer,
      roleCodes: ["demand_operator"],
      permissions: [
        PERMISSIONS.DEMAND_READ,
        PERMISSIONS.DEMAND_PROGRESS,
        PERMISSIONS.DEMAND_MERGE,
        PERMISSIONS.DEMAND_ASSOCIATE_APPLICATION,
      ],
    };
    const demand: DemandEntry = {
      demandId: "demand-bridge",
      requesterEmployeeId: "E100",
      title: "Governed assistant",
      problemStatement: "Teams need an approved assistant.",
      desiredOutcome: "A formally published application.",
      status: "claimed",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: false,
      reviewReason: null,
      likeCount: 0,
      commentCount: 0,
      priorityScore: null,
      priorityExplanation: null,
      ownerEmployeeId: "E100",
      primarySolutionApplicationId: null,
      version: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      findById: async () => demand,
      withTransaction: async <T>(
        operation: (repo: DemandRepository) => Promise<T>,
      ) => operation(repository as unknown as DemandRepository),
      withApplicationTransaction: async <T>(
        operation: (
          demandRepository: DemandRepository,
          applicationRepository: never,
        ) => Promise<T>,
      ) =>
        operation(
          repository as unknown as DemandRepository,
          undefined as never,
        ),
      linkApplication: async (
        demandId: string,
        applicationId: string,
        role: "candidate" | "pilot" | "solution",
        isPrimary: boolean,
        expectedVersion: number,
        linkedByEmployeeId: string,
      ) => {
        expect(expectedVersion).toBe(4);
        demand.version += 1;
        return {
          demandId,
          applicationId,
          role,
          isPrimary,
          linkedByEmployeeId,
          createdAt: new Date(),
        };
      },
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const applicationBridge = {
      createApplicationInTransaction: async () => ({
        applicationId: "application-from-demand",
      }),
    };
    const service = new DemandService(
      repository,
      { authorize: allowAll },
      applicationBridge,
    );

    await expect(
      service.createApplicationFromDemand(operator, demand.demandId, {
        name: "Governed assistant",
        summary: "A formally reviewed assistant.",
        role: "solution",
        isPrimary: true,
        expectedVersion: 4,
      }),
    ).resolves.toMatchObject({
      applicationId: "application-from-demand",
      isPrimary: true,
    });
  });
});
