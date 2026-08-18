import { describe, expect, it } from "vitest";
import { validate } from "class-validator";
import { ListCatalogQueryDto } from "../../catalog/catalog.dto.js";
import {
  ListApplicationsAdminQueryDto,
  CompleteUnifiedUploadBodyDto,
} from "../../application/application.dto.js";
import { ListDemandsQueryDto, DemandVersionQueryDto } from "../../demand/demand.dto.js";
import { ListFeedbackQueryDto } from "../../feedback/feedback.dto.js";
import {
  ListCommentsQueryDto,
  ListRatingsQueryDto,
} from "../../interaction/interaction.dto.js";
import {
  ListEmployeesQueryDto,
  ListSyncRunsQueryDto,
  DingTalkSsoStartQueryDto,
  DingTalkSsoCallbackQueryDto,
  SecurityAuditQueryDto,
} from "../../identity/identity.dto.js";
import { DashboardQueryDto } from "../../analytics/analytics.dto.js";

async function expectInvalid(dto: object): Promise<void> {
  const errors = await validate(dto);
  expect(errors.length).toBeGreaterThan(0);
}

async function expectValid(dto: object): Promise<void> {
  const errors = await validate(dto);
  expect(errors.length).toBe(0);
}

describe("查询/请求体 DTO 输入校验（高危-1）", () => {
  it("ListCatalogQueryDto：非法 sort / 负 page / 超大 pageSize 拒绝，合法放行", async () => {
    await expectInvalid(Object.assign(new ListCatalogQueryDto(), { sort: "evil" }));
    await expectInvalid(Object.assign(new ListCatalogQueryDto(), { page: -1 }));
    await expectInvalid(
      Object.assign(new ListCatalogQueryDto(), { pageSize: 999999 }),
    );
    await expectValid(
      Object.assign(new ListCatalogQueryDto(), {
        sort: "latest",
        page: 2,
        pageSize: 20,
        query: "hello",
      }),
    );
  });

  it("ListApplicationsAdminQueryDto：非法 status / mode / channel 拒绝", async () => {
    await expectInvalid(
      Object.assign(new ListApplicationsAdminQueryDto(), { status: "bogus" }),
    );
    await expectInvalid(
      Object.assign(new ListApplicationsAdminQueryDto(), { mode: "x" }),
    );
    await expectInvalid(
      Object.assign(new ListApplicationsAdminQueryDto(), { channel: "ftp" }),
    );
    await expectValid(
      Object.assign(new ListApplicationsAdminQueryDto(), {
        status: "published",
        mode: "all",
        channel: "web",
        sort: "name",
      }),
    );
  });

  it("ListDemandsQueryDto：非法 status / audienceType / sort 拒绝", async () => {
    await expectInvalid(
      Object.assign(new ListDemandsQueryDto(), { status: "nope" }),
    );
    await expectInvalid(
      Object.assign(new ListDemandsQueryDto(), { audienceType: "everyone" }),
    );
    await expectInvalid(
      Object.assign(new ListDemandsQueryDto(), { sort: "weird" }),
    );
    await expectValid(
      Object.assign(new ListDemandsQueryDto(), {
        status: "claimed",
        audienceType: "department",
        sort: "hot",
      }),
    );
  });

  it("DemandVersionQueryDto：超长 expectedVersion 拒绝", async () => {
    await expectInvalid(
      Object.assign(new DemandVersionQueryDto(), {
        expectedVersion: "x".repeat(100),
      }),
    );
    await expectValid(new DemandVersionQueryDto());
  });

  it("ListFeedbackQueryDto：非法 scope 拒绝", async () => {
    await expectInvalid(
      Object.assign(new ListFeedbackQueryDto(), { scope: "allof" }),
    );
    await expectValid(
      Object.assign(new ListFeedbackQueryDto(), { scope: "mine" }),
    );
  });

  it("ListCommentsQueryDto / ListRatingsQueryDto：分页校验", async () => {
    await expectInvalid(Object.assign(new ListCommentsQueryDto(), { page: 0 }));
    await expectValid(new ListRatingsQueryDto());
  });

  it("ListEmployeesQueryDto：分页 + keyword", async () => {
    await expectInvalid(
      Object.assign(new ListEmployeesQueryDto(), { page: -3 }),
    );
    await expectValid(
      Object.assign(new ListEmployeesQueryDto(), { keyword: "张" }),
    );
  });

  it("ListSyncRunsQueryDto：limit 范围", async () => {
    await expectInvalid(
      Object.assign(new ListSyncRunsQueryDto(), { limit: 999 }),
    );
    await expectValid(Object.assign(new ListSyncRunsQueryDto(), { limit: 50 }));
  });

  it("DingTalkSsoStartQueryDto：returnTo 长度", async () => {
    await expectInvalid(
      Object.assign(new DingTalkSsoStartQueryDto(), {
        returnTo: "x".repeat(3000),
      }),
    );
    await expectValid(new DingTalkSsoStartQueryDto());
  });

  it("DingTalkSsoCallbackQueryDto：state / code 必填且受长度约束", async () => {
    await expectInvalid(new DingTalkSsoCallbackQueryDto());
    await expectValid(
      Object.assign(new DingTalkSsoCallbackQueryDto(), {
        state: "s",
        code: "c",
      }),
    );
  });

  it("SecurityAuditQueryDto：非法 result / 分页", async () => {
    await expectInvalid(
      Object.assign(new SecurityAuditQueryDto(), { result: "maybe" }),
    );
    await expectInvalid(
      Object.assign(new SecurityAuditQueryDto(), { page: "bad" } as Record<
        string,
        unknown
      >),
    );
    await expectValid(
      Object.assign(new SecurityAuditQueryDto(), {
        result: "success",
        module: "auth",
      }),
    );
  });

  it("DashboardQueryDto：from / to 默认空且受长度约束", async () => {
    const dto = new DashboardQueryDto();
    expect(dto.from).toBe("");
    expect(dto.to).toBe("");
    await expectInvalid(
      Object.assign(new DashboardQueryDto(), { from: "x".repeat(50) }),
    );
    await expectValid(new DashboardQueryDto());
  });

  it("CompleteUnifiedUploadBodyDto：超长 signature 拒绝（行内 body 修复）", async () => {
    await expectInvalid(
      Object.assign(new CompleteUnifiedUploadBodyDto(), {
        signature: "x".repeat(600),
      }),
    );
    await expectValid(
      Object.assign(new CompleteUnifiedUploadBodyDto(), { signature: "ok" }),
    );
  });
});
