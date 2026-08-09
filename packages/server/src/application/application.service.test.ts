import { describe, expect, it } from "vitest";
import type {
  ActorContext,
  AuthorizationDecision,
  BehaviorEventInput,
} from "@ai-hub/contracts";
import { ApplicationService } from "./application.service.js";
import type {
  ApplicationRecord,
  ApplicationRepository,
  ApplicationVersionRecord,
  DeliveryRecord,
  ReviewQueueRecord,
  ReviewRecord,
} from "./application.types.js";

const owner: ActorContext = {
  employeeId: "E100",
  roleCodes: ["application_owner"],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-owner",
};
const reviewer: ActorContext = {
  employeeId: "E200",
  roleCodes: ["application_reviewer"],
  departmentIds: ["dept-review"],
  primaryDepartmentId: "dept-review",
  sessionId: "session-reviewer",
};
const outsider: ActorContext = {
  employeeId: "E300",
  roleCodes: ["employee"],
  departmentIds: ["dept-other"],
  primaryDepartmentId: "dept-other",
  sessionId: "session-outsider",
};

class MemoryApplicationRepository implements ApplicationRepository {
  applications = new Map<string, ApplicationRecord>();
  versions = new Map<string, ApplicationVersionRecord>();
  deliveries: DeliveryRecord[] = [];
  reviews: ReviewRecord[] = [];
  reviewQueue: ReviewQueueRecord[] = [];
  audits: string[] = [];
  events: string[] = [];
  nextId = 1;

  async withTransaction<T>(
    operation: (repository: this) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
  async createApplication(input: {
    ownerEmployeeId: string;
    maintainerEmployeeId: string;
    departmentId: string;
    name: string;
    summary: string;
  }) {
    const application: ApplicationRecord = {
      applicationId: `app-${this.nextId++}`,
      ownerEmployeeId: input.ownerEmployeeId,
      maintainerEmployeeId: input.maintainerEmployeeId,
      departmentId: input.departmentId,
      name: input.name,
      summary: input.summary,
      status: "draft",
      currentVersionId: null,
    };
    this.applications.set(application.applicationId, application);
    return application;
  }
  async findApplication(id: string) {
    return this.applications.get(id) ?? null;
  }
  async createVersion(input: Omit<ApplicationVersionRecord, "createdAt">) {
    const version = { ...input, createdAt: new Date() };
    this.versions.set(version.applicationVersionId, version);
    return version;
  }
  async findVersion(id: string) {
    return this.versions.get(id) ?? null;
  }
  async listVersions(applicationId: string) {
    return [...this.versions.values()].filter(
      (version) => version.applicationId === applicationId,
    );
  }
  async setApplicationStatus(
    id: string,
    status: ApplicationRecord["status"],
    currentVersionId?: string,
  ) {
    const current = this.applications.get(id);
    if (current === undefined) throw new Error("APPLICATION_NOT_FOUND");
    const updated = {
      ...current,
      status,
      currentVersionId: currentVersionId ?? current.currentVersionId,
    };
    this.applications.set(id, updated);
    return updated;
  }
  async createDelivery(input: Omit<DeliveryRecord, "deliveryId">) {
    const delivery = { ...input, deliveryId: `delivery-${this.nextId++}` };
    this.deliveries.push(delivery);
    return delivery;
  }
  async listDeliveries(id: string) {
    return this.deliveries.filter((delivery) => delivery.applicationId === id);
  }
  async createReview(input: Omit<ReviewRecord, "reviewId" | "createdAt">) {
    const review = {
      ...input,
      reviewId: `review-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.reviews.push(review);
    return review;
  }
  async listReviews(id: string) {
    return this.reviews.filter((review) => review.applicationId === id);
  }
  async createReviewQueue(
    input: Omit<ReviewQueueRecord, "reviewQueueId" | "createdAt">,
  ) {
    const queue = {
      ...input,
      reviewQueueId: `queue-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.reviewQueue.push(queue);
    return queue;
  }
  async findReviewQueueByVersion(id: string) {
    return (
      this.reviewQueue.find((queue) => queue.applicationVersionId === id) ??
      null
    );
  }
  async claimReviewQueue(id: string, employeeId: string) {
    const queue = this.reviewQueue.find(
      (candidate) => candidate.applicationVersionId === id,
    );
    if (queue === undefined || queue.status !== "available") {
      throw new Error("REVIEW_QUEUE_NOT_AVAILABLE");
    }
    const updated = {
      ...queue,
      status: "claimed" as const,
      claimedByEmployeeId: employeeId,
      claimedAt: new Date(),
    };
    this.reviewQueue[this.reviewQueue.indexOf(queue)] = updated;
    return updated;
  }
  async releaseReviewQueue(id: string, employeeId: string) {
    const queue = this.reviewQueue.find(
      (candidate) => candidate.applicationVersionId === id,
    );
    if (queue === undefined || queue.claimedByEmployeeId !== employeeId) {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    const updated = {
      ...queue,
      status: "available" as const,
      claimedByEmployeeId: null,
      claimedAt: null,
    };
    this.reviewQueue[this.reviewQueue.indexOf(queue)] = updated;
    return updated;
  }
  async recordAudit(input: { eventType: string }) {
    this.audits.push(input.eventType);
  }
  async emitOutbox(input: { eventType: string }) {
    this.events.push(input.eventType);
  }
}

const allowAll = async (): Promise<AuthorizationDecision> => ({
  allowed: true,
  reasonCode: "ALLOW_TEST",
});
const versionInput = {
  version: "1.0.0",
  changelog: "Initial release",
  artifactKey: "artifacts/app-1/1.0.0.zip",
  artifactSha256: "a".repeat(64),
  artifactSignature: "signature-1",
  scanStatus: "passed" as const,
};

function makeService() {
  const repository = new MemoryApplicationRepository();
  const analyticsEvents: string[] = [];
  const artifactVerifier = {
    async verifyArtifact(input: { signature: string; expectedSha256: string }) {
      if (input.signature === "reject") {
        return {
          accepted: false as const,
          scanStatus: "failed" as const,
          sha256: input.expectedSha256,
          reason: "MALWARE_DETECTED" as const,
        };
      }
      return {
        accepted: true as const,
        scanStatus: "passed" as const,
        sha256: input.expectedSha256,
      };
    },
  };
  return {
    repository,
    service: new ApplicationService(
      repository,
      { authorize: allowAll },
      artifactVerifier,
      {
        record: async (
          _actor: ActorContext | null,
          input: BehaviorEventInput,
        ) => {
          analyticsEvents.push(input.eventName);
          return { inserted: true };
        },
      },
    ),
    analyticsEvents,
  };
}

async function configureAllDeliveryChannels(
  service: ApplicationService,
  applicationId: string,
): Promise<void> {
  for (const channel of ["web", "desktop", "mobile", "mini_program"] as const) {
    await service.configureDelivery(owner, applicationId, {
      channel,
      entryUrl: `https://${channel}.internal/apps/${applicationId}`,
      enabled: true,
    });
  }
}

describe("ApplicationService", () => {
  it("keeps versions immutable and rejects duplicate version numbers", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await service.createVersion(owner, application.applicationId, versionInput);
    await expect(
      service.createVersion(owner, application.applicationId, versionInput),
    ).rejects.toThrow("VERSION_ALREADY_EXISTS");
  });

  it("persists maintainer and department ownership fields", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: "E200",
      departmentId: "dept-platform",
    } as never);

    expect(application).toMatchObject({
      ownerEmployeeId: "E100",
      maintainerEmployeeId: "E200",
      departmentId: "dept-platform",
    });
  });

  it("limits application reads to owner, maintainer, or application managers", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: reviewer.employeeId,
    } as never);

    await expect(
      service.getApplication(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
    await expect(
      service.listVersions(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
    await expect(
      service.listDeliveries(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
    await expect(
      service.listReviews(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");

    await expect(
      service.getApplication(application.applicationId, reviewer),
    ).resolves.toMatchObject({ applicationId: application.applicationId });
    await expect(
      service.getApplication(application.applicationId, {
        ...outsider,
        permissions: ["application.manage"],
      }),
    ).resolves.toMatchObject({ applicationId: application.applicationId });
  });

  it("does not create a version from rejected artifact verification", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });

    await expect(
      service.createVersion(owner, application.applicationId, {
        ...versionInput,
        artifactSignature: "reject",
      } as never),
    ).rejects.toThrow("ARTIFACT_NOT_VERIFIED");
    expect(repository.versions).toHaveLength(0);
  });

  it("creates and claims a review queue item with an SLA notification", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);

    const queue = await (
      service as unknown as {
        claimReview: (
          actor: ActorContext,
          versionId: string,
        ) => Promise<unknown>;
      }
    ).claimReview(reviewer, version.applicationVersionId);

    expect(queue).toMatchObject({
      applicationVersionId: version.applicationVersionId,
      status: "claimed",
      claimedByEmployeeId: "E200",
    });
    expect(repository.events).toContain("application.review.requested");
    expect(repository.events).toContain("application.review.claimed");
    await expect(
      service.getReviewQueue(version.applicationVersionId),
    ).resolves.toMatchObject({ slaStatus: "on_time" });
  });

  it("moves a scanned version through review, approval, publication, withdrawal, and archive", async () => {
    const { service, repository, analyticsEvents } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);
    await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "Looks good",
    );
    expect(analyticsEvents).toContain("review_decided");
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.publish(owner, version.applicationVersionId);
    await service.withdraw(owner, application.applicationId, "superseded");
    await service.archive(owner, application.applicationId);
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({
      status: "archived",
      currentVersionId: version.applicationVersionId,
    });
    expect(repository.audits).toEqual([
      "application.created",
      "application.version.created",
      "application.submitted",
      "application.review.requested",
      "application.review.sla.created",
      "application.review.claimed",
      "application.reviewed",
      "application.delivery.configured",
      "application.delivery.configured",
      "application.delivery.configured",
      "application.delivery.configured",
      "application.published",
      "application.withdrawn",
      "application.archived",
    ]);
    expect(repository.events).toHaveLength(14);
  });

  it("requires all four delivery channels before publication", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);
    await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "Approved",
    );

    await expect(
      service.publish(owner, version.applicationVersionId),
    ).rejects.toThrow("DELIVERY_CHANNELS_INCOMPLETE");
  });

  it("rejects self-review and publication before approval", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await expect(
      service.publish(owner, version.applicationVersionId),
    ).rejects.toThrow("INVALID_APPLICATION_TRANSITION");
    await service.submitForReview(owner, version.applicationVersionId);
    await expect(
      service.review(owner, version.applicationVersionId, "approve", "self"),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
  });

  it("does not allow physical deletion", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await expect(
      service.deleteApplication(owner, application.applicationId),
    ).rejects.toThrow("PHYSICAL_DELETE_FORBIDDEN");
  });

  it("keeps older versions readable and supports audited rollback", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const first = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, first.applicationVersionId);
    await service.claimReview(reviewer, first.applicationVersionId);
    await service.review(
      reviewer,
      first.applicationVersionId,
      "approve",
      "Approved",
    );
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.publish(owner, first.applicationVersionId);
    const second = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, version: "2.0.0", changelog: "Second release" },
    );
    expect(await service.listVersions(application.applicationId)).toHaveLength(
      2,
    );
    await service.submitForReview(owner, second.applicationVersionId);
    await service.claimReview(reviewer, second.applicationVersionId);
    await service.review(
      reviewer,
      second.applicationVersionId,
      "approve",
      "Approved",
    );
    await service.publish(owner, second.applicationVersionId);
    await service.rollback(
      owner,
      application.applicationId,
      first.applicationVersionId,
    );
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({
      status: "published",
      currentVersionId: first.applicationVersionId,
    });
    await expect(
      service.listVersions(application.applicationId),
    ).resolves.toHaveLength(2);
    expect(repository.events).toContain("application.rolled_back");
  });
});
