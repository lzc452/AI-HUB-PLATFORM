import { describe, expect, it } from "vitest";
import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";
import { CreatorService } from "./creator.service.js";
import type { CreatorRepository } from "./creator.types.js";

const owner: ActorContext = {
  employeeId: "E100",
  roleCodes: ["application_owner"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-E100",
};

class MemoryCreatorRepository implements CreatorRepository {
  async findTeam(applicationId: string) {
    return applicationId === "app-1"
      ? { ownerEmployeeId: "E100", maintainerEmployeeId: "E101" }
      : null;
  }
  async getVersionDiff() {
    return {
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      changedFields: ["summary"],
    };
  }
  async getValidationReport() {
    return {
      status: "passed" as const,
      checks: [{ name: "artifact", status: "passed" as const }],
    };
  }
  async getAggregateMetrics() {
    return {
      redirectCount: 5,
      downloadCount: 3,
      qrDisplayCount: 2,
      likeCount: 4,
      ratingAverage: 4.5,
      reviewCount: 2,
    };
  }
}

const allowAll = async (): Promise<AuthorizationDecision> => ({
  allowed: true,
  reasonCode: "ALLOW_TEST",
});

describe("CreatorService", () => {
  it("returns version, validation and aggregate data without visitor lists", async () => {
    const service = new CreatorService(new MemoryCreatorRepository(), {
      authorize: allowAll,
    });
    const result = await service.getApplicationSummary(owner, "app-1");

    expect(result).toMatchObject({
      versionDiff: { fromVersion: "1.0.0", toVersion: "2.0.0" },
      validationReport: { status: "passed" },
      metrics: { redirectCount: 5, ratingAverage: 4.5 },
    });
    expect(result).not.toHaveProperty("visitorEmployeeIds");
  });

  it("rejects a non-owner and non-maintainer from creator data", async () => {
    const service = new CreatorService(new MemoryCreatorRepository(), {
      authorize: allowAll,
    });
    await expect(
      service.getApplicationSummary({ ...owner, employeeId: "E999" }, "app-1"),
    ).rejects.toThrow("CREATOR_ACCESS_FORBIDDEN");
  });
});
