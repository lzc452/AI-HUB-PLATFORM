import { describe, expect, it } from "vitest";
import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";
import { CreatorService } from "./creator.service.js";
import type {
  CreatorApplicationRecord,
  CreatorRepository,
} from "./creator.types.js";

const owner: ActorContext = {
  employeeId: "E100",
  roleCodes: ["application_owner"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-E100",
};

const myApplications: readonly CreatorApplicationRecord[] = [
  {
    applicationId: "app-1",
    name: "平台流程自动化",
    status: "published",
    categoryId: "cat-productivity",
    tagIds: ["tag-ai"],
    publishedAt: "2026-08-01T00:00:00.000Z",
    ratingAverage: 4.5,
    likeCount: 4,
    pendingVersionId: null,
  },
  {
    applicationId: "app-2",
    name: "草稿应用",
    status: "draft",
    categoryId: "",
    tagIds: [],
    publishedAt: null,
    ratingAverage: null,
    likeCount: 0,
    pendingVersionId: null,
  },
];

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
  async getValidationReport(): Promise<{
    status: "passed" | "no_record";
    checks: readonly {
      code: string;
      label: string;
      status: "passed" | "safe" | "warning" | "info" | "failed";
      detail: string | null;
    }[];
  }> {
    return {
      status: "passed" as const,
      checks: [
        {
          code: "artifact.digest",
          label: "SHA-256 摘要校验",
          status: "passed" as const,
          detail: null,
        },
      ],
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
  async listByEmployee(employeeId: string) {
    return employeeId === "E100" ? myApplications : [];
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

  it("passes through no_record when the report has no checks", async () => {
    class EmptyReportRepository extends MemoryCreatorRepository {
      override async getValidationReport() {
        return { status: "no_record" as const, checks: [] };
      }
    }
    const service = new CreatorService(new EmptyReportRepository(), {
      authorize: allowAll,
    });
    const result = await service.getApplicationSummary(owner, "app-1");

    expect(result.validationReport).toEqual({
      status: "no_record",
      checks: [],
    });
  });

  it("rejects a non-owner and non-maintainer from creator data", async () => {
    const service = new CreatorService(new MemoryCreatorRepository(), {
      authorize: allowAll,
    });
    await expect(
      service.getApplicationSummary({ ...owner, employeeId: "E999" }, "app-1"),
    ).rejects.toThrow("CREATOR_ACCESS_FORBIDDEN");
  });

  it("lists owned and maintained applications with pagination envelope", async () => {
    const service = new CreatorService(new MemoryCreatorRepository(), {
      authorize: allowAll,
    });
    const result = await service.listMyApplications(owner);

    expect(result.page).toBe(1);
    expect(result.total).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.items).toEqual(myApplications);
  });

  it("returns an empty page when the actor has no applications", async () => {
    const service = new CreatorService(new MemoryCreatorRepository(), {
      authorize: allowAll,
    });
    const result = await service.listMyApplications({
      ...owner,
      employeeId: "E999",
    });

    expect(result.items).toEqual([]);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(0);
  });

  it("rejects listing when authorization is denied", async () => {
    const service = new CreatorService(new MemoryCreatorRepository(), {
      authorize: async () => ({ allowed: false, reasonCode: "DENY_TEST" }),
    });
    await expect(service.listMyApplications(owner)).rejects.toThrow(
      "NOT_AUTHORIZED",
    );
  });
});
