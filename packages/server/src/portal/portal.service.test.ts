import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
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
  permissions: ["application.create", "application.publish", "interaction.interact"],
  sessionId: "S-1",
};

const reviewer: ActorContext = {
  ...owner,
  employeeId: "E-REVIEWER",
  displayName: "审核人",
  permissions: ["application.review", "application.publish"],
};

const resource = (status: PortalResourceItem["status"]): PortalResourceItem => ({
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

function createRepository(overrides: Partial<KyselyPortalRepository> = {}): KyselyPortalRepository {
  return {
    createDraft: vi.fn(async (_actor, input) => ({ ...resource("draft"), slug: input.slug })),
    findResourceById: vi.fn(async () => resource("draft")),
    transition: vi.fn(async (_actor, _type, _id, _from, to) => resource(to)),
    ...overrides,
  } as unknown as KyselyPortalRepository;
}

describe("PortalService", () => {
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
      expect.objectContaining({ slug: "document-helper", resourceType: "skill" }),
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

    const result = await service.submit(owner, "skill", resource("draft").resourceId);

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

    const result = await service.approve(reviewer, "skill", resource("in_review").resourceId);

    expect(result.status).toBe("approved");
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
    ).toEqual({ repositoryUrl: "https://git.example/repo", auth: { mode: "oauth" } });
  });
});
