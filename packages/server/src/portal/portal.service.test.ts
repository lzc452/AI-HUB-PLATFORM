import { describe, expect, it, vi } from "vitest";
import type { ActorContext, ApplicationDraft } from "@ai-hub/contracts";
import {
  assertPortalReplyParent,
  KyselyPortalRepository,
  redactPortalMetadata,
} from "./portal.repository.js";
import { PortalService } from "./portal.service.js";
import type { PortalResourceItem } from "./portal.types.js";

const owner: ActorContext = {
  employeeId: "E-OWNER",
  displayName: "资源所有者",
  primaryDepartmentId: "D-1",
  departmentIds: ["D-1"],
  roleCodes: ["employee"],
  permissions: [
    "application.create",
    "application.publish",
    "interaction.interact",
  ],
  sessionId: "S-1",
};

const reviewer: ActorContext = {
  ...owner,
  employeeId: "E-REVIEWER",
  displayName: "审核人",
  permissions: ["application.review", "application.publish"],
};
const applicationAdmin: ActorContext = {
  ...owner,
  employeeId: "E-APPLICATION-ADMIN",
  displayName: "应用管理员",
  roleCodes: ["application_admin"],
  permissions: ["application.manage", "application.publish"],
};

const resource = (
  status: PortalResourceItem["status"],
): PortalResourceItem => ({
  resourceId: "00000000-0000-0000-0000-000000000001",
  resourceType: "skill",
  ownerEmployeeId: owner.employeeId,
  ownerName: owner.displayName ?? "",
  slug: "document-helper",
  name: "文档助手",
  summary: "帮助员工整理文档",
  status,
  metadata: {},
  favoriteCount: 0,
  isFavorited: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const applicationResource = (
  status: PortalResourceItem["status"],
): PortalResourceItem => ({
  ...resource(status),
  resourceId: "00000000-0000-0000-0000-000000000101",
  resourceType: "app",
  slug: "00000000-0000-0000-0000-000000000101",
});

const applicationDraft: ApplicationDraft = {
  name: "文档助手",
  departmentId: "D-1",
  maintainerEmployeeIds: [owner.employeeId],
  categoryId: "productivity",
  applicationType: "web_app",
  tagIds: [],
  icon: { mode: "auto", backgroundColor: "#FFFFFF", text: "文", assetId: null },
  screenshotAssetIds: [],
  summaryHtml: "<p>帮助员工整理文档</p>",
  manualHtml: null,
  manualAssetId: null,
  examplesHtml: null,
  examplesAssetId: null,
  faq: [],
  audience: [
    {
      audienceType: "all",
      departmentId: null,
      employeeId: null,
      includeChildren: false,
    },
  ],
  risk: {
    handlesSensitiveData: false,
    sendsDataExternally: false,
    retainsConversations: false,
    retentionPeriod: null,
    modelProviders: ["local"],
    providerNote: null,
    affectsHighRiskDecisions: false,
    inputRestrictionDisclaimer: "不处理受限输入。",
  },
  deliveries: [],
  version: "1.0.0",
  changelog: "初始版本",
};

function createRepository(
  overrides: Partial<KyselyPortalRepository> = {},
): KyselyPortalRepository {
  return {
    createDraft: vi.fn(async (_actor, input) => ({
      ...resource("draft"),
      slug: input.slug,
    })),
    findResourceById: vi.fn(async () => resource("draft")),
    saveVersion: vi.fn(async () => undefined),
    transition: vi.fn(async (_actor, _type, _id, _from, to) => resource(to)),
    ...overrides,
  } as unknown as KyselyPortalRepository;
}

type ApplicationServiceMock = {
  claimReview: ReturnType<typeof vi.fn>;
  createApplication: ReturnType<typeof vi.fn>;
  getApplication: ReturnType<typeof vi.fn>;
  getDraft: ReturnType<typeof vi.fn>;
  getReviewQueue: ReturnType<typeof vi.fn>;
  listVersions: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  review: ReturnType<typeof vi.fn>;
  saveDraft: ReturnType<typeof vi.fn>;
  submitDraft: ReturnType<typeof vi.fn>;
  withdraw: ReturnType<typeof vi.fn>;
};

function createApplicationService(
  overrides: Partial<ApplicationServiceMock> = {},
): ApplicationServiceMock {
  return {
    createApplication: vi.fn(async () => ({
      applicationId: applicationResource("draft").resourceId,
    })),
    saveDraft: vi.fn(async () => ({})),
    getDraft: vi.fn(async () => ({ draft: applicationDraft })),
    submitDraft: vi.fn(async () => ({})),
    listVersions: vi.fn(async () => [
      {
        applicationVersionId: "00000000-0000-0000-0000-000000000201",
        createdAt: new Date("2026-08-25T00:00:00.000Z"),
      },
    ]),
    getReviewQueue: vi.fn(async () => ({
      status: "available",
      claimedByEmployeeId: null,
    })),
    claimReview: vi.fn(async () => ({})),
    review: vi.fn(async () => ({})),
    getApplication: vi.fn(async () => ({
      status: "approved",
      currentVersionId: "00000000-0000-0000-0000-000000000201",
    })),
    publish: vi.fn(async () => ({})),
    withdraw: vi.fn(async () => ({})),
    ...overrides,
  };
}

function createPortalService(
  repository: KyselyPortalRepository,
  applications: ApplicationServiceMock,
) {
  return new PortalService(repository, applications as never);
}

describe("PortalService", () => {
  it("读取应用完整草稿与更新时间，并先校验 owner", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("draft")),
    });
    const applications = createApplicationService({
      getDraft: vi.fn(async () => ({
        draft: applicationDraft,
        updatedAt: "2026-08-28T01:02:03.000Z",
      })),
    });
    const result = await createPortalService(repository, applications).draft(
      owner,
      applicationResource("draft").resourceId,
    );
    expect(result.applicationDraft).toEqual(applicationDraft);
    expect(result.draftUpdatedAt).toBe("2026-08-28T01:02:03.000Z");
    expect(applications.getDraft).toHaveBeenCalledWith(
      owner,
      applicationResource("draft").resourceId,
    );
  });

  it("空壳应用草稿读取返回明确的 NOT_FOUND 错误", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("draft")),
    });
    const applications = createApplicationService({
      getDraft: vi.fn(async () => {
        throw new Error("DRAFT_NOT_FOUND");
      }),
    });
    await expect(
      createPortalService(repository, applications).draft(
        owner,
        applicationResource("draft").resourceId,
      ),
    ).rejects.toThrow("PORTAL_APP_DRAFT_NOT_FOUND");
  });

  it("规范化 slug 并创建独立 Skill 草稿", async () => {
    const repository = createRepository();
    const service = new PortalService(repository);

    const result = await service.createDraft(owner, {
      resourceType: "skill",
      slug: "Document-Helper",
      name: "文档助手",
      summary: "帮助员工整理文档",
    });

    expect(result.slug).toBe("document-helper");
    expect(repository.createDraft).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        slug: "document-helper",
        resourceType: "skill",
      }),
    );
  });

  it("拒绝包含路径字符的 slug", async () => {
    const service = new PortalService(createRepository());
    await expect(
      service.createDraft(owner, {
        resourceType: "plugin",
        slug: "../plugin",
        name: "安全插件",
        summary: "用于验证发布输入",
      }),
    ).rejects.toThrow("PORTAL_SLUG_INVALID");
  });

  it("所有者可提交草稿进入审核", async () => {
    const repository = createRepository();
    const service = new PortalService(repository);

    const result = await service.submit(
      owner,
      "skill",
      resource("draft").resourceId,
    );

    expect(result.status).toBe("in_review");
    expect(repository.transition).toHaveBeenCalledWith(
      owner,
      "skill",
      resource("draft").resourceId,
      ["draft", "withdrawn"],
      "in_review",
    );
  });

  it("禁止资源所有者自审", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => resource("in_review")),
    });
    const service = new PortalService(repository);
    const ownerReviewer = { ...reviewer, employeeId: owner.employeeId };

    await expect(
      service.approve(ownerReviewer, "skill", resource("in_review").resourceId),
    ).rejects.toThrow("PORTAL_SELF_REVIEW_FORBIDDEN");
  });

  it("审核人可批准他人的待审资源", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => resource("in_review")),
    });
    const service = new PortalService(repository);

    const result = await service.approve(
      reviewer,
      "skill",
      resource("in_review").resourceId,
    );

    expect(result.status).toBe("approved");
  });
});

describe("Portal app 生命周期委托", () => {
  it("创建 app 时通过 ApplicationService 保存完整草稿，不写 Portal 仓储", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("draft")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    const result = await service.createDraft(owner, {
      resourceType: "app",
      slug: "document-helper",
      name: "文档助手",
      summary: "帮助员工整理文档",
      applicationDraft,
    });

    expect(applications.createApplication).toHaveBeenCalledWith(owner, {
      name: "文档助手",
      summary: "帮助员工整理文档",
    });
    expect(applications.saveDraft).toHaveBeenCalledWith(
      owner,
      applicationResource("draft").resourceId,
      applicationDraft,
    );
    expect(repository.createDraft).not.toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ resourceType: "app" }),
    );
    expect(result.resourceType).toBe("app");
  });

  it("创建 app 时兼容完整旧 metadata 草稿", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("draft")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    await service.createDraft(owner, {
      resourceType: "app",
      slug: "document-helper",
      name: "文档助手",
      summary: "帮助员工整理文档",
      metadata: applicationDraft,
    });

    expect(applications.saveDraft).toHaveBeenCalledWith(
      owner,
      applicationResource("draft").resourceId,
      applicationDraft,
    );
  });

  it("app 更新缺少完整草稿时拒绝任意 metadata", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("draft")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    await expect(
      service.updateDraft(
        owner,
        "app",
        applicationResource("draft").resourceId,
        {
          slug: "document-helper",
          name: "文档助手",
          summary: "帮助员工整理文档",
          metadata: { legacy: true },
        },
      ),
    ).rejects.toThrow("PORTAL_APP_DRAFT_REQUIRED");
    expect(applications.saveDraft).not.toHaveBeenCalled();
  });

  it("app 保存版本只合并回标准草稿，不提前创建版本", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("draft")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    await service.saveVersion(
      owner,
      "app",
      applicationResource("draft").resourceId,
      {
        version: "1.1.0",
        changelog: "修复发布流程",
      },
    );

    expect(applications.saveDraft).toHaveBeenCalledWith(
      owner,
      applicationResource("draft").resourceId,
      expect.objectContaining({ version: "1.1.0", changelog: "修复发布流程" }),
    );
    expect(repository.saveVersion).not.toHaveBeenCalled();
  });

  it("app 提交委托标准 submitDraft，版本与审核队列由其原子创建", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("in_review")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    const result = await service.submit(
      owner,
      "app",
      applicationResource("draft").resourceId,
    );

    expect(applications.submitDraft).toHaveBeenCalledWith(
      owner,
      applicationResource("draft").resourceId,
    );
    expect(repository.transition).not.toHaveBeenCalledWith(
      owner,
      "app",
      expect.any(String),
      expect.any(Array),
      expect.any(String),
    );
    expect(result.status).toBe("in_review");
  });

  it("app 审核自动认领可用队列，并调用标准 review", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("published")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    await service.approve(
      reviewer,
      "app",
      applicationResource("draft").resourceId,
    );

    expect(applications.claimReview).toHaveBeenCalledWith(
      reviewer,
      "00000000-0000-0000-0000-000000000201",
    );
    expect(applications.review).toHaveBeenCalledWith(
      reviewer,
      "00000000-0000-0000-0000-000000000201",
      "approve",
      "由 AI Hub Portal 审核通过",
    );
  });

  it("app 审核队列已被他人认领时拒绝，不覆盖认领", async () => {
    const repository = createRepository();
    const applications = createApplicationService({
      getReviewQueue: vi.fn(async () => ({
        status: "claimed",
        claimedByEmployeeId: "E-OTHER",
      })),
    });
    const service = createPortalService(repository, applications);

    await expect(
      service.requestChanges(
        reviewer,
        "app",
        applicationResource("draft").resourceId,
      ),
    ).rejects.toThrow("PORTAL_REVIEW_CLAIMED_BY_OTHER");
    expect(applications.claimReview).not.toHaveBeenCalled();
    expect(applications.review).not.toHaveBeenCalled();
  });

  it("app 存在多个有效审核队列时拒绝猜测审核版本", async () => {
    const repository = createRepository();
    const applications = createApplicationService({
      listVersions: vi.fn(async () => [
        {
          applicationVersionId: "00000000-0000-0000-0000-000000000201",
          createdAt: new Date("2026-08-25T00:00:00.000Z"),
        },
        {
          applicationVersionId: "00000000-0000-0000-0000-000000000202",
          createdAt: new Date("2026-08-26T00:00:00.000Z"),
        },
      ]),
    });
    const service = createPortalService(repository, applications);

    await expect(
      service.approve(reviewer, "app", applicationResource("draft").resourceId),
    ).rejects.toThrow("PORTAL_REVIEW_QUEUE_CONFLICT");
    expect(applications.claimReview).not.toHaveBeenCalled();
    expect(applications.review).not.toHaveBeenCalled();
  });

  it("已发布 app 的 Portal publish 以幂等成功返回", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("published")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    const result = await service.publish(
      owner,
      "app",
      applicationResource("published").resourceId,
    );

    expect(applications.publish).not.toHaveBeenCalled();
    expect(result.status).toBe("published");
  });

  it("app 下架使用标准 withdraw 和 Portal 默认原因", async () => {
    const repository = createRepository({
      findResourceById: vi.fn(async () => applicationResource("withdrawn")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    await service.withdraw(
      owner,
      "app",
      applicationResource("published").resourceId,
    );

    expect(applications.withdraw).toHaveBeenCalledWith(
      owner,
      applicationResource("published").resourceId,
      "由 AI Hub Portal 发起下架",
    );
  });

  it("应用管理员可通过 Portal 调用标准 app 发布与下架", async () => {
    const repository = createRepository({
      findResourceById: vi
        .fn()
        .mockResolvedValueOnce(applicationResource("approved"))
        .mockResolvedValueOnce(applicationResource("approved"))
        .mockResolvedValueOnce(applicationResource("published")),
    });
    const applications = createApplicationService();
    const service = createPortalService(repository, applications);

    await service.publish(
      applicationAdmin,
      "app",
      applicationResource("approved").resourceId,
    );
    await service.withdraw(
      applicationAdmin,
      "app",
      applicationResource("published").resourceId,
    );

    expect(applications.publish).toHaveBeenCalledWith(
      applicationAdmin,
      expect.any(String),
    );
    expect(applications.withdraw).toHaveBeenCalledWith(
      applicationAdmin,
      applicationResource("published").resourceId,
      "由 AI Hub Portal 发起下架",
    );
  });
});

describe("Portal 评论回复约束", () => {
  it("允许回复同一资源的根评论", () => {
    expect(() =>
      assertPortalReplyParent(
        { resourceType: "skill", resourceId: "S-1", parentCommentId: null },
        "skill",
        "S-1",
      ),
    ).not.toThrow();
  });

  it("禁止回复二级评论", () => {
    expect(() =>
      assertPortalReplyParent(
        { resourceType: "skill", resourceId: "S-1", parentCommentId: "C-ROOT" },
        "skill",
        "S-1",
      ),
    ).toThrow("PORTAL_REPLY_DEPTH_EXCEEDED");
  });

  it("禁止跨资源回复", () => {
    expect(() =>
      assertPortalReplyParent(
        { resourceType: "plugin", resourceId: "P-1", parentCommentId: null },
        "skill",
        "S-1",
      ),
    ).toThrow("PORTAL_PARENT_COMMENT_NOT_FOUND");
  });
});

describe("Portal 元数据输出保护", () => {
  it("递归移除存储键与凭据", () => {
    expect(
      redactPortalMetadata({
        repositoryUrl: "https://git.example/repo",
        storageKey: "private/object.zip",
        auth: { accessToken: "sensitive", mode: "oauth" },
      }),
    ).toEqual({
      repositoryUrl: "https://git.example/repo",
      auth: { mode: "oauth" },
    });
  });
});
