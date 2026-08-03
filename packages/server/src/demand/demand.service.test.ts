import { describe, expect, it } from "vitest";
import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";
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
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-requester",
};
const reviewer: ActorContext = {
  employeeId: "E900",
  roleCodes: ["demand_reviewer"],
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
      desiredOutcome: "Return cited guidance in under one minute.",
      audienceType: "all",
    });
    expect(draft.title).toBe("Internal knowledge assistant");

    await expect(
      service.createDraft(requester, {
        title: " ",
        problemStatement: "too short",
        desiredOutcome: "too short",
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
    expect(demand.status).toBe("published");
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
      status: "published" as const,
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
        status: "published" as const,
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
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = new DemandService(repository, { authorize: allowAll });

    await service.addComment(requester, {
      demandId: "demand-public",
      parentCommentId: null,
      body: "Please include source links.",
      displayAnonymously: true,
    });
    comment.parentCommentId = "comment-root";
    await expect(
      service.addComment(requester, {
        demandId: "demand-public",
        parentCommentId: "comment-1",
        body: "A nested reply is not allowed.",
      }),
    ).rejects.toThrow("DEMAND_COMMENT_DEPTH_EXCEEDED");
    await expect(
      service.lookupAnonymousAuthor(reviewer, "comment-1"),
    ).resolves.toBe("E100");
    expect(audits).toContain("demand.anonymous_identity.viewed");
  });

  it("hides and restores reported comments without deleting them", async () => {
    const operator: ActorContext = {
      ...reviewer,
      roleCodes: ["demand_operator"],
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
      setCommentHidden: async (_commentId: string, value: Date | null) => {
        hiddenAt = value;
      },
      recordAudit: async () => undefined,
      emitOutbox: async () => undefined,
    } as unknown as DemandRepository;
    const service = new DemandService(repository, { authorize: allowAll });

    await service.resolveReport(operator, "report-1", "hidden");
    expect(hiddenAt).toBeInstanceOf(Date);
    await service.resolveReport(operator, "report-1", "restored");
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
      status: "published",
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
      status: "published",
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
