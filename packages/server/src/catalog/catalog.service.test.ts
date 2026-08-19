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
    myRating: 4,
    likedByMe: true,
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
    myRating: null,
    likedByMe: false,
    healthStatus: "unknown",
    deprecatedReason: null,
    replacementApplicationId: null,
  },
  {
    applicationId: "app-miniprogram",
    name: "报销助手",
    summary: "小程序报销",
    departmentId: "dept-platform",
    categoryId: "cat-productivity",
    tagIds: [],
    trustLabels: ["verified"],
    currentVersionId: "version-miniprogram",
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    deliveryChannels: ["mini_program"],
    likeCount: 3,
    ratingAverage: 4,
    myRating: null,
    likedByMe: false,
    healthStatus: "healthy",
    deprecatedReason: null,
    replacementApplicationId: null,
  },
];

type MemoryOwners = Record<
  string,
  { ownerEmployeeId: string; maintainerEmployeeId: string | null }
>;

class MemoryCatalogRepository implements CatalogRepository {
  recordedActions: string[] = [];
  auditEvents: Array<{
    applicationId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }> = [];
  riskDescriptions: Record<string, string> = {};
  constructor(
    private readonly visibleEntries = entries,
    private readonly qrAsset: {
      storageKey: string;
      mimeType: string;
    } | null = null,
    private readonly delivery: {
      deliveryId: string;
      entryUrl: string;
      enabled: boolean;
    } = {
      deliveryId: "delivery-1",
      entryUrl: "https://app.company.com",
      enabled: true,
    },
    private readonly owners: MemoryOwners = {},
  ) {}

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

  async findDelivery(): Promise<{
    deliveryId: string;
    entryUrl: string;
    enabled: boolean;
  } | null> {
    return this.delivery;
  }

  async findDeliveryAssetStorageKey(): Promise<string | null> {
    return null;
  }

  async findQrAssetForDelivery() {
    return this.qrAsset;
  }

  async findApplicationIdForDelivery(deliveryId: string) {
    // delivery-1 模拟 app-platform 的交付；其余视为不存在。
    if (deliveryId === "delivery-1") return "app-platform";
    return null;
  }

  async getRiskDescription(): Promise<string | null> {
    return null;
  }

  async upsertRiskDescription(
    applicationId: string,
    description: string,
  ): Promise<void> {
    this.riskDescriptions[applicationId] = description;
  }

  async recordAudit(input: {
    applicationId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void> {
    this.auditEvents.push(input);
  }

  async listCategories() {
    return [];
  }

  async listTags() {
    return [];
  }

  async findApplicationOwner(applicationId: string) {
    return this.owners[applicationId] ?? null;
  }
}

describe("CatalogService", () => {
  it("filters list results by the actor audience before ranking", async () => {
    const service = new CatalogService(new MemoryCatalogRepository());

    await expect(
      service.list({ actor: employee, sort: "popular", page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [
        { applicationId: "app-platform" },
        { applicationId: "app-miniprogram" },
      ],
      total: 2,
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

  it("透传仓库返回的 myRating 与 likedByMe（列表与详情）", async () => {
    const service = new CatalogService(new MemoryCatalogRepository());

    // 列表：已评分的应用带出 4 星与已赞，其他应用为 null/false。
    const list = await service.list({
      actor: employee,
      sort: "latest",
      page: 1,
      pageSize: 20,
    });
    expect(list.items[0]).toMatchObject({
      applicationId: "app-platform",
      myRating: 4,
      likedByMe: true,
    });

    const detail = await service.getDetail(employee, "app-platform");
    expect(detail).toMatchObject({ myRating: 4, likedByMe: true });

    const financeDetail = await service.getDetail(
      outsideEmployee,
      "app-finance",
    );
    expect(financeDetail).toMatchObject({ myRating: null, likedByMe: false });
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

  it("resolveDelivery 小程序渠道返回二维码资产地址（qr assetUrl）", async () => {
    const service = new CatalogService(
      new MemoryCatalogRepository(entries, {
        storageKey: "qr/reimburse.png",
        mimeType: "image/png",
      }),
    );

    await expect(
      service.resolveDelivery(employee, "app-miniprogram", "mini_program"),
    ).resolves.toEqual({
      kind: "qr",
      assetUrl: "/internal/catalog/deliveries/delivery-1/qr",
    });
  });

  it("resolveDelivery 小程序无二维码资产时回退 entryUrl 文本 payload", async () => {
    const service = new CatalogService(new MemoryCatalogRepository(entries));

    await expect(
      service.resolveDelivery(employee, "app-miniprogram", "mini_program"),
    ).resolves.toEqual({
      kind: "qr",
      payload: "https://app.company.com",
    });
  });

  it("resolveDelivery web 渠道返回合法 entryUrl 跳转", async () => {
    const service = new CatalogService(new MemoryCatalogRepository(entries));

    await expect(
      service.resolveDelivery(employee, "app-platform", "web"),
    ).resolves.toEqual({
      kind: "web_redirect",
      url: "https://app.company.com",
    });
  });

  it("resolveDelivery web 渠道拒绝空 entryUrl", async () => {
    const service = new CatalogService(
      new MemoryCatalogRepository(entries, null, {
        deliveryId: "delivery-1",
        entryUrl: "",
        enabled: true,
      }),
    );

    await expect(
      service.resolveDelivery(employee, "app-platform", "web"),
    ).rejects.toThrow("WEB_DELIVERY_URL_MISSING");
  });

  it("resolveDelivery web 渠道拒绝纯空白 entryUrl", async () => {
    const service = new CatalogService(
      new MemoryCatalogRepository(entries, null, {
        deliveryId: "delivery-1",
        entryUrl: "   ",
        enabled: true,
      }),
    );

    await expect(
      service.resolveDelivery(employee, "app-platform", "web"),
    ).rejects.toThrow("WEB_DELIVERY_URL_MISSING");
  });

  it("resolveDelivery web 渠道拒绝非 http(s) 的 entryUrl", async () => {
    const service = new CatalogService(
      new MemoryCatalogRepository(entries, null, {
        deliveryId: "delivery-1",
        entryUrl: "javascript:alert(1)",
        enabled: true,
      }),
    );

    await expect(
      service.resolveDelivery(employee, "app-platform", "web"),
    ).rejects.toThrow("WEB_DELIVERY_URL_MISSING");
  });

  it("resolveDelivery web 渠道拒绝无法解析的 entryUrl", async () => {
    const service = new CatalogService(
      new MemoryCatalogRepository(entries, null, {
        deliveryId: "delivery-1",
        entryUrl: "not a url",
        enabled: true,
      }),
    );

    await expect(
      service.resolveDelivery(employee, "app-platform", "web"),
    ).rejects.toThrow("WEB_DELIVERY_URL_MISSING");
  });

  it("resolveDelivery 桌面渠道无资产且 entryUrl 非法时回退 unavailable 而非 web_redirect", async () => {
    const desktopEntry = [
      { ...entries[0]!, deliveryChannels: ["desktop"] as const },
    ];
    const service = new CatalogService(
      new MemoryCatalogRepository(desktopEntry, null, {
        deliveryId: "delivery-1",
        entryUrl: "not-a-url",
        enabled: true,
      }),
    );

    await expect(
      service.resolveDelivery(employee, "app-platform", "desktop"),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "该渠道暂未配置可下载安装包",
    });
  });

  it("resolveDelivery 桌面渠道无资产但 entryUrl 合法时回退 web_redirect", async () => {
    const desktopEntry = [
      { ...entries[0]!, deliveryChannels: ["desktop"] as const },
    ];
    const service = new CatalogService(
      new MemoryCatalogRepository(desktopEntry, null, {
        deliveryId: "delivery-1",
        entryUrl: "https://app.company.com",
        enabled: true,
      }),
    );

    await expect(
      service.resolveDelivery(employee, "app-platform", "desktop"),
    ).resolves.toEqual({
      kind: "web_redirect",
      url: "https://app.company.com",
    });
  });

  it("getQrAsset 返回二维码资产存储信息（含应用可见性校验）", async () => {
    const service = new CatalogService(
      new MemoryCatalogRepository(entries, {
        storageKey: "qr/reimburse.png",
        mimeType: "image/png",
      }),
    );

    await expect(service.getQrAsset(employee, "delivery-1")).resolves.toEqual({
      storageKey: "qr/reimburse.png",
      mimeType: "image/png",
    });
  });

  it("getQrAsset 拒绝受众外的员工访问", async () => {
    const service = new CatalogService(
      new MemoryCatalogRepository(entries, {
        storageKey: "qr/reimburse.png",
        mimeType: "image/png",
      }),
    );

    await expect(
      service.getQrAsset(outsideEmployee, "delivery-1"),
    ).rejects.toThrow("CATALOG_APPLICATION_NOT_FOUND");
  });

  it("getQrAsset 交付不存在或资产被删时抛 CATALOG_DELIVERY_ASSET_NOT_FOUND", async () => {
    const withAsset = new CatalogService(
      new MemoryCatalogRepository(entries, {
        storageKey: "qr/reimburse.png",
        mimeType: "image/png",
      }),
    );
    const withoutAsset = new CatalogService(
      new MemoryCatalogRepository(entries),
    );

    await expect(
      withAsset.getQrAsset(employee, "delivery-unknown"),
    ).rejects.toThrow("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    await expect(
      withoutAsset.getQrAsset(employee, "delivery-1"),
    ).rejects.toThrow("CATALOG_DELIVERY_ASSET_NOT_FOUND");
  });

  describe("saveRiskDescription", () => {
    const owners: MemoryOwners = {
      "app-platform": { ownerEmployeeId: "E100", maintainerEmployeeId: null },
      "app-finance": { ownerEmployeeId: "E100", maintainerEmployeeId: "E200" },
    };

    it("owner 可更新风险说明并写入审计事件（trim 后内容）", async () => {
      const repository = new MemoryCatalogRepository(
        entries,
        null,
        undefined,
        owners,
      );
      const service = new CatalogService(repository);

      await expect(
        service.saveRiskDescription(employee, "app-platform", " 新的风险说明 "),
      ).resolves.toBeUndefined();

      expect(repository.riskDescriptions).toEqual({
        "app-platform": "新的风险说明",
      });
      expect(repository.auditEvents).toEqual([
        {
          applicationId: "app-platform",
          actorEmployeeId: "E100",
          eventType: "catalog.risk_updated",
          details: { riskDescription: "新的风险说明" },
        },
      ]);
    });

    it("maintainer 可更新风险说明", async () => {
      const repository = new MemoryCatalogRepository(
        entries,
        null,
        undefined,
        owners,
      );
      const service = new CatalogService(repository);

      await expect(
        service.saveRiskDescription(
          outsideEmployee,
          "app-finance",
          "维护人更新",
        ),
      ).resolves.toBeUndefined();
      expect(repository.riskDescriptions).toEqual({
        "app-finance": "维护人更新",
      });
    });

    it("非 owner/maintainer 但具备 APPLICATION_MANAGE 权限的员工可更新风险说明", async () => {
      const repository = new MemoryCatalogRepository(
        entries,
        null,
        undefined,
        owners,
      );
      const service = new CatalogService(repository);
      const manageActor: ActorContext = {
        ...outsideEmployee,
        permissions: ["application.manage"],
      };

      await expect(
        service.saveRiskDescription(manageActor, "app-finance", "管理员更新"),
      ).resolves.toBeUndefined();
    });

    it("非 owner/maintainer 且无 APPLICATION_MANAGE 权限的员工被拒绝且无审计", async () => {
      const repository = new MemoryCatalogRepository(entries, null, undefined, {
        "app-finance": { ownerEmployeeId: "E100", maintainerEmployeeId: null },
      });
      const service = new CatalogService(repository);

      await expect(
        service.saveRiskDescription(outsideEmployee, "app-finance", "越权更新"),
      ).rejects.toThrow("NOT_AUTHORIZED");
      expect(repository.riskDescriptions).toEqual({});
      expect(repository.auditEvents).toEqual([]);
    });

    it("空风险说明被拒绝且不写入审计", async () => {
      const repository = new MemoryCatalogRepository(
        entries,
        null,
        undefined,
        owners,
      );
      const service = new CatalogService(repository);

      await expect(
        service.saveRiskDescription(employee, "app-platform", "   "),
      ).rejects.toThrow("RISK_DESCRIPTION_REQUIRED");
      expect(repository.auditEvents).toEqual([]);
    });
  });
});
