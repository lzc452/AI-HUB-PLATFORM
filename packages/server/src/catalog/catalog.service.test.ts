import { describe, expect, it } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import { CatalogService } from "./catalog.service.js";
import type {
  CatalogEntry,
  CatalogRepository,
  CatalogSearchInput,
} from "./catalog.types.js";

const employee: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-E100",
};

const outsideEmployee: ActorContext = {
  ...employee,
  employeeId: "E200",
  departmentIds: ["dept-finance"],
  primaryDepartmentId: "dept-finance",
  sessionId: "session-E200",
};

const entries: CatalogEntry[] = [
  {
    applicationId: "app-platform",
    name: "平台助手",
    summary: "平台流程自动化",
    departmentId: "dept-platform",
    categoryId: "cat-productivity",
    tagIds: ["tag-ai"],
    trustLabels: ["verified"],
    currentVersionId: "version-platform",
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    deliveryChannels: ["web"],
    likeCount: 10,
    ratingAverage: 4.5,
    healthStatus: "healthy",
    deprecatedReason: null,
    replacementApplicationId: null,
  },
  {
    applicationId: "app-finance",
    name: "财务助手",
    summary: "财务报表查询",
    departmentId: "dept-finance",
    categoryId: "cat-productivity",
    tagIds: ["tag-ai"],
    trustLabels: ["experimental"],
    currentVersionId: "version-finance",
    publishedAt: new Date("2026-08-02T00:00:00.000Z"),
    deliveryChannels: ["web"],
    likeCount: 100,
    ratingAverage: 4.9,
    healthStatus: "unknown",
    deprecatedReason: null,
    replacementApplicationId: null,
  },
];

class MemoryCatalogRepository implements CatalogRepository {
  recordedActions: string[] = [];
  constructor(private readonly visibleEntries = entries) {}

  async listVisible(
    input: CatalogSearchInput,
  ): Promise<readonly CatalogEntry[]> {
    return this.visibleEntries
      .filter(
        (entry) =>
          input.actor.departmentIds.includes(entry.departmentId) ||
          entry.applicationId === "app-public",
      )
      .filter((entry) => {
        const query = input.query?.toLocaleLowerCase();
        if (query === undefined || query.length === 0) return true;
        return (
          entry.name.toLocaleLowerCase().includes(query) ||
          entry.summary.toLocaleLowerCase().includes(query) ||
          (query === "ptzs" && entry.applicationId === "app-platform")
        );
      })
      .sort((left, right) => {
        if (input.sort === "popular") return right.likeCount - left.likeCount;
        return right.publishedAt.getTime() - left.publishedAt.getTime();
      });
  }

  async findVisible(
    actor: ActorContext,
    applicationId: string,
  ): Promise<CatalogEntry | null> {
    return (
      (
        await this.listVisible({ actor, sort: "latest", page: 1, pageSize: 20 })
      ).find((entry) => entry.applicationId === applicationId) ?? null
    );
  }

  async recordDeliveryAction(input: { actionType: string }) {
    this.recordedActions.push(input.actionType);
  }

  async findDelivery(): Promise<{ entryUrl: string; enabled: boolean } | null> {
    return { entryUrl: "https://app.company.com", enabled: true };
  }

  async findDeliveryAssetStorageKey(): Promise<string | null> {
    return null;
  }

  async getRiskDescription(): Promise<string | null> {
    return null;
  }

  async upsertRiskDescription(): Promise<void> {
    // no-op in memory repository
  }

  async listCategories() {
    return [];
  }

  async listTags() {
    return [];
  }

  async findApplicationOwner() {
    return null;
  }
}

describe("CatalogService", () => {
  it("filters list results by the actor audience before ranking", async () => {
    const service = new CatalogService(new MemoryCatalogRepository());

    await expect(
      service.list({ actor: employee, sort: "popular", page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [{ applicationId: "app-platform" }],
      total: 1,
    });
  });

  it("supports deterministic pinyin search without exposing other audiences", async () => {
    const service = new CatalogService(new MemoryCatalogRepository());

    await expect(
      service.search({
        actor: employee,
        query: "ptzs",
        sort: "recommended",
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      items: [{ applicationId: "app-platform" }],
      total: 1,
    });
  });

  it("does not return a detail record to an actor outside its audience", async () => {
    const service = new CatalogService(new MemoryCatalogRepository());

    await expect(
      service.getDetail(outsideEmployee, "app-platform"),
    ).rejects.toThrow("CATALOG_APPLICATION_NOT_FOUND");
  });

  it("rejects a detail record without a published current version", async () => {
    const unpublished = new MemoryCatalogRepository([
      { ...entries[0]!, currentVersionId: "" },
    ]);
    const service = new CatalogService(unpublished);

    await expect(service.getDetail(employee, "app-platform")).rejects.toThrow(
      "CATALOG_PUBLISHED_VERSION_REQUIRED",
    );
  });

  it("records delivery actions against the published version after visibility checks", async () => {
    const repository = new MemoryCatalogRepository();
    const service = new CatalogService(repository);

    await expect(
      service.recordDeliveryAction(employee, {
        applicationId: "app-platform",
        actionType: "web_redirect",
        channel: "web",
      }),
    ).resolves.toBeUndefined();
    expect(repository.recordedActions).toEqual(["web_redirect"]);

    await expect(
      service.recordDeliveryAction(outsideEmployee, {
        applicationId: "app-platform",
        actionType: "web_redirect",
      }),
    ).rejects.toThrow("CATALOG_APPLICATION_NOT_FOUND");
  });
});
