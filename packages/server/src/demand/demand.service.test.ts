import { describe, expect, it } from "vitest";
import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";
import { DemandService } from "./demand.service.js";
import type { DemandEntry, DemandRepository } from "./demand.types.js";

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
