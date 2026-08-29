import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
  type ApplicationDraft,
} from "@ai-hub/contracts";
import { DraftValidationError } from "../application/application.service.js";
import type { ApplicationService } from "../application/application.service.js";
import { KyselyPortalRepository } from "./portal.repository.js";
import type {
  DashboardCommentQuery,
  PortalDraftInput,
  PortalListInput,
  PortalNativeDraftInput,
  PortalResourceType,
  PortalVersionInput,
  PortalApplicationDraftDetail,
} from "./portal.types.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const defaultApproveComment = "由 AI Hub Portal 审核通过";
const defaultRequestChangesComment = "由 AI Hub Portal 请求修改";
const defaultWithdrawReason = "由 AI Hub Portal 发起下架";

type ApplicationLifecycleService = Pick<
  ApplicationService,
  | "claimReview"
  | "createApplication"
  | "getApplication"
  | "getDraft"
  | "getReviewQueue"
  | "listVersions"
  | "publish"
  | "review"
  | "saveDraft"
  | "submitDraft"
  | "withdraw"
>;

const applicationErrorMap: Readonly<Record<string, string>> = {
  APPLICATION_ACCESS_FORBIDDEN: "PORTAL_RESOURCE_OWNER_REQUIRED",
  APPLICATION_NOT_EDITABLE: "PORTAL_RESOURCE_NOT_EDITABLE",
  APPLICATION_NOT_FOUND: "PORTAL_RESOURCE_NOT_FOUND",
  APPLICATION_OWNER_REQUIRED: "PORTAL_RESOURCE_OWNER_REQUIRED",
  APPLICATION_VERSION_NOT_FOUND: "PORTAL_REVIEW_QUEUE_NOT_FOUND",
  ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE:
    "PORTAL_ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE",
  DELIVERY_CHANNELS_INCOMPLETE: "PORTAL_DELIVERY_CHANNELS_INCOMPLETE",
  DELIVERY_TARGETS_INCOMPLETE: "PORTAL_DELIVERY_TARGETS_INCOMPLETE",
  DRAFT_NOT_FOUND: "PORTAL_APP_DRAFT_REQUIRED",
  INVALID_APPLICATION_TRANSITION: "PORTAL_RESOURCE_STATE_CONFLICT",
  NOT_AUTHORIZED: "PORTAL_PUBLISH_FORBIDDEN",
  REVIEW_COMMENT_REQUIRED: "PORTAL_REVIEW_COMMENT_REQUIRED",
  REVIEW_QUEUE_CLAIM_REQUIRED: "PORTAL_REVIEW_CLAIM_REQUIRED",
  REVIEW_QUEUE_NOT_AVAILABLE: "PORTAL_REVIEW_CLAIM_CONFLICT",
  REVIEW_QUEUE_NOT_FOUND: "PORTAL_REVIEW_QUEUE_NOT_FOUND",
  SELF_REVIEW_FORBIDDEN: "PORTAL_SELF_REVIEW_FORBIDDEN",
  VERSION_ALREADY_EXISTS: "PORTAL_VERSION_ALREADY_EXISTS",
};

/**
 * Portal 保留自己的 URL 与读取模型，但 app 的所有写入均委托标准
 * ApplicationService，避免绕过审核、目录、审计与 Outbox 不变量。
 */
export class PortalService {
  constructor(
    private readonly repository: KyselyPortalRepository,
    private readonly applications?: ApplicationLifecycleService,
  ) {}

  async home(actor: ActorContext | null) {
    const [apps, skills, plugins, mcps, departments, packages, updates] =
      await Promise.all([
        this.repository.listResources(actor, "app", this.featuredQuery()),
        this.repository.listResources(actor, "skill", this.featuredQuery()),
        this.repository.listResources(actor, "plugin", this.featuredQuery()),
        this.repository.listResources(actor, "mcp", this.featuredQuery()),
        this.repository.listDepartments(),
        this.repository.listSkillPackages(),
        this.repository.getContentPage("updates"),
      ]);
    return {
      apps: apps.items,
      skills: skills.items,
      plugins: plugins.items,
      mcps: mcps.items,
      departments: departments.slice(0, 8),
      skillPackages: packages.slice(0, 8),
      updates,
    };
  }

  list(
    actor: ActorContext | null,
    type: PortalResourceType,
    input: PortalListInput,
  ) {
    if (
      input.status !== undefined &&
      input.status !== "published" &&
      (actor === null ||
        (input.ownerEmployeeId !== actor.employeeId &&
          !hasPermission(actor, PERMISSIONS.APPLICATION_REVIEW)))
    ) {
      throw new Error("PORTAL_RESOURCE_LIST_FORBIDDEN");
    }
    return this.repository.listResources(actor, type, input);
  }

  async detail(
    actor: ActorContext | null,
    type: PortalResourceType,
    ownerEmployeeId: string | null,
    slug: string,
  ) {
    const resource = await this.repository.findResource(
      actor,
      type,
      ownerEmployeeId,
      slug,
    );
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return resource;
  }

  async createDraft(actor: ActorContext, input: PortalDraftInput) {
    if (!hasPermission(actor, PERMISSIONS.APPLICATION_CREATE)) {
      throw new Error("PORTAL_PUBLISH_FORBIDDEN");
    }
    const normalized = this.normalizeDraft(input);
    if (input.resourceType !== "app") {
      return this.repository.createDraft(actor, {
        ...input,
        ...normalized,
        resourceType: input.resourceType,
      } satisfies PortalNativeDraftInput);
    }

    // 历史 Portal 创建请求可只创建应用壳；若携带完整 metadata/applicationDraft，
    // 再经标准草稿保存链路持久化，绝不写入任意 JSON 草稿。
    const draft = this.extractApplicationDraft(input, false);
    const application = await this.applicationCall(() =>
      this.requireApplications().createApplication(actor, {
        name: normalized.name,
        summary: normalized.summary,
      }),
    );
    if (draft !== null) {
      const completeDraft = draft;
      await this.applicationCall(() =>
        this.requireApplications().saveDraft(
          actor,
          application.applicationId,
          completeDraft,
        ),
      );
    }
    return this.readApplicationResource(actor, application.applicationId);
  }

  async updateDraft(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    input: Omit<PortalDraftInput, "resourceType">,
  ) {
    if (type !== "app") {
      await this.requireOwned(actor, type, resourceId);
      return this.repository.updateDraft(actor, type, resourceId, {
        ...input,
        ...this.normalizeDraft(input),
      });
    }

    await this.requireOwned(actor, type, resourceId);
    const draft = this.extractApplicationDraft(input, true);
    if (draft === null) throw new Error("PORTAL_APP_DRAFT_REQUIRED");
    await this.applicationCall(() =>
      this.requireApplications().saveDraft(actor, resourceId, draft),
    );
    return this.readApplicationResource(actor, resourceId);
  }

  async draft(
    actor: ActorContext,
    applicationId: string,
  ): Promise<PortalApplicationDraftDetail> {
    await this.requireOwned(actor, "app", applicationId);
    let record: Awaited<ReturnType<ApplicationLifecycleService["getDraft"]>>;
    try {
      record = await this.applicationCall(() =>
        this.requireApplications().getDraft(actor, applicationId),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "PORTAL_APP_DRAFT_REQUIRED"
      ) {
        throw new Error("PORTAL_APP_DRAFT_NOT_FOUND");
      }
      throw error;
    }
    return {
      resource: await this.readApplicationResource(actor, applicationId),
      applicationDraft: record.draft,
      draftUpdatedAt: record.updatedAt,
    };
  }

  async saveVersion(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    input: PortalVersionInput,
  ) {
    const version = input.version.trim();
    if (!versionPattern.test(version)) {
      throw new Error("PORTAL_VERSION_INVALID");
    }
    const changelog = input.changelog.trim();

    if (type !== "app") {
      const resource = await this.requireOwned(actor, type, resourceId);
      if (!["draft", "withdrawn"].includes(resource.status)) {
        throw new Error("PORTAL_RESOURCE_NOT_EDITABLE");
      }
      await this.repository.saveVersion(actor, type, resourceId, {
        ...input,
        version,
        changelog,
      });
      return { resourceId, resourceType: type, version };
    }

    await this.requireOwned(actor, type, resourceId);
    const record = await this.applicationCall(() =>
      this.requireApplications().getDraft(actor, resourceId),
    );
    const draft = this.requireCompleteApplicationDraft(record.draft);
    await this.applicationCall(() =>
      this.requireApplications().saveDraft(actor, resourceId, {
        ...draft,
        version,
        changelog,
      }),
    );
    return { resourceId, resourceType: type, version };
  }

  async submit(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
  ) {
    if (type !== "app") {
      await this.requireOwned(actor, type, resourceId);
      return this.repository.transition(
        actor,
        type,
        resourceId,
        ["draft", "withdrawn"],
        "in_review",
      );
    }

    await this.requireOwned(actor, type, resourceId);
    const record = await this.applicationCall(() =>
      this.requireApplications().getDraft(actor, resourceId),
    );
    this.requireCompleteApplicationDraft(record.draft);
    await this.applicationCall(() =>
      this.requireApplications().submitDraft(actor, resourceId),
    );
    return this.readApplicationResource(actor, resourceId);
  }

  async approve(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    comment?: string,
  ) {
    if (!hasPermission(actor, PERMISSIONS.APPLICATION_REVIEW)) {
      throw new Error("PORTAL_REVIEW_FORBIDDEN");
    }
    if (type !== "app") {
      const resource = await this.repository.findResourceById(
        actor,
        type,
        resourceId,
      );
      if (resource?.ownerEmployeeId === actor.employeeId) {
        throw new Error("PORTAL_SELF_REVIEW_FORBIDDEN");
      }
      return this.repository.transition(
        actor,
        type,
        resourceId,
        ["in_review"],
        "approved",
      );
    }
    return this.reviewApplication(
      actor,
      resourceId,
      "approve",
      this.normalizeReviewComment(comment, defaultApproveComment),
    );
  }

  async requestChanges(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    comment?: string,
  ) {
    if (!hasPermission(actor, PERMISSIONS.APPLICATION_REVIEW)) {
      throw new Error("PORTAL_REVIEW_FORBIDDEN");
    }
    if (type !== "app") {
      const resource = await this.repository.findResourceById(
        actor,
        type,
        resourceId,
      );
      if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
      if (resource.ownerEmployeeId === actor.employeeId) {
        throw new Error("PORTAL_SELF_REVIEW_FORBIDDEN");
      }
      return this.repository.transition(
        actor,
        type,
        resourceId,
        ["in_review"],
        "draft",
      );
    }
    return this.reviewApplication(
      actor,
      resourceId,
      "request_changes",
      this.normalizeReviewComment(comment, defaultRequestChangesComment),
    );
  }

  async publish(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
  ) {
    if (type !== "app") {
      const resource = await this.requireOwnedOrPermission(
        actor,
        type,
        resourceId,
        PERMISSIONS.APPLICATION_PUBLISH,
      );
      return this.repository.transition(
        actor,
        type,
        resource.resourceId,
        ["approved"],
        "published",
      );
    }

    const resource = await this.requireOwnedOrPermission(
      actor,
      type,
      resourceId,
      PERMISSIONS.APPLICATION_MANAGE,
    );
    if (resource.status === "published") return resource;
    const application = await this.applicationCall(() =>
      this.requireApplications().getApplication(resourceId),
    );
    if (application.status !== "approved") {
      throw new Error("PORTAL_RESOURCE_STATE_CONFLICT");
    }
    if (application.currentVersionId === null) {
      throw new Error("PORTAL_LEGACY_VERSION_REQUIRED");
    }
    await this.applicationCall(() =>
      this.requireApplications().publish(
        actor,
        application.currentVersionId as string,
      ),
    );
    return this.readApplicationResource(actor, resourceId);
  }

  async withdraw(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    reason?: string,
  ) {
    if (type !== "app") {
      await this.requireOwned(actor, type, resourceId);
      return this.repository.transition(
        actor,
        type,
        resourceId,
        ["published", "in_review", "approved"],
        "withdrawn",
      );
    }

    await this.requireOwnedOrPermission(
      actor,
      type,
      resourceId,
      PERMISSIONS.APPLICATION_MANAGE,
    );
    await this.applicationCall(() =>
      this.requireApplications().withdraw(
        actor,
        resourceId,
        this.normalizeReviewComment(reason, defaultWithdrawReason),
      ),
    );
    return this.readApplicationResource(actor, resourceId);
  }

  async favorite(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    active: boolean,
  ) {
    const resource = await this.repository.findResourceById(
      actor,
      type,
      resourceId,
    );
    if (resource === null || resource.status !== "published") {
      throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    }
    return {
      resourceId,
      resourceType: type,
      active: await this.repository.setFavorite(
        actor,
        type,
        resourceId,
        active,
      ),
    };
  }

  async listComments(
    actor: ActorContext | null,
    type: PortalResourceType,
    resourceId: string,
  ) {
    const resource = await this.repository.findResourceById(
      actor,
      type,
      resourceId,
    );
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return this.repository.listComments(type, resourceId);
  }

  async createComment(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    body: string,
    parentCommentId: string | null,
  ) {
    if (!hasPermission(actor, PERMISSIONS.INTERACTION_INTERACT)) {
      throw new Error("PORTAL_COMMENT_FORBIDDEN");
    }
    const normalized = body.trim();
    if (normalized.length < 1 || normalized.length > 4000) {
      throw new Error("PORTAL_COMMENT_BODY_INVALID");
    }
    const resource = await this.repository.findResourceById(
      actor,
      type,
      resourceId,
    );
    if (resource === null || resource.status !== "published") {
      throw new Error("PORTAL_RESOURCE_NOT_COMMENTABLE");
    }
    return this.repository.createComment(
      actor,
      type,
      resourceId,
      normalized,
      parentCommentId,
    );
  }

  dashboardComments(actor: ActorContext, input: DashboardCommentQuery) {
    return this.repository.listDashboardComments(actor, input);
  }

  dashboard(actor: ActorContext) {
    return this.repository.dashboardSummary(actor);
  }

  stars(actor: ActorContext, page: number, pageSize: number) {
    return this.repository.listFavorites(actor, page, pageSize);
  }

  departments() {
    return this.repository.listDepartments();
  }

  async department(actor: ActorContext | null, departmentId: string) {
    const [profile, applications] = await Promise.all([
      this.repository.getDepartment(departmentId),
      this.repository.listDepartmentApplications(actor, departmentId),
    ]);
    if (profile === null) throw new Error("PORTAL_DEPARTMENT_NOT_FOUND");
    return { ...profile, applications };
  }

  skillPackages() {
    return this.repository.listSkillPackages();
  }

  async skillPackage(packageSlug: string) {
    const value = await this.repository.getSkillPackage(packageSlug);
    if (value === null) throw new Error("PORTAL_SKILL_PACKAGE_NOT_FOUND");
    return value;
  }

  hunt(actor: ActorContext | null) {
    return this.repository.listHunt(actor);
  }

  voteHunt(actor: ActorContext, periodId: string, entryId: string) {
    return this.repository.voteHunt(actor, periodId, entryId);
  }

  async doc(pageKey: "tutorials" | "about" | "updates") {
    const value = await this.repository.getContentPage(pageKey);
    if (value === null) throw new Error("PORTAL_CONTENT_PAGE_NOT_FOUND");
    return value;
  }

  private async reviewApplication(
    actor: ActorContext,
    applicationId: string,
    decision: "approve" | "request_changes",
    comment: string,
  ) {
    const versionId = await this.findActiveReviewVersion(applicationId, actor);
    await this.applicationCall(async () => {
      const queue = await this.requireApplications().getReviewQueue(versionId);
      if (
        queue.status === "claimed" &&
        queue.claimedByEmployeeId !== actor.employeeId
      ) {
        throw new Error("PORTAL_REVIEW_CLAIMED_BY_OTHER");
      }
      if (queue.status === "available") {
        await this.requireApplications().claimReview(actor, versionId);
      }
      return this.requireApplications().review(
        actor,
        versionId,
        decision,
        comment,
      );
    });
    return this.readApplicationResource(actor, applicationId);
  }

  private async findActiveReviewVersion(
    applicationId: string,
    actor: ActorContext,
  ): Promise<string> {
    const versions = await this.applicationCall(() =>
      this.requireApplications().listVersions(applicationId),
    );
    const candidates = await this.applicationCall(() =>
      Promise.all(
        versions.map(async (version) => {
          try {
            const queue = await this.requireApplications().getReviewQueue(
              version.applicationVersionId,
            );
            return { version, queue };
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "REVIEW_QUEUE_NOT_FOUND"
            ) {
              return null;
            }
            throw error;
          }
        }),
      ),
    );
    const activeCandidates = candidates.filter(
      (candidate): candidate is NonNullable<(typeof candidates)[number]> =>
        candidate !== null &&
        (candidate.queue.status === "available" ||
          candidate.queue.status === "claimed"),
    );
    if (activeCandidates.length === 0) {
      throw new Error("PORTAL_REVIEW_QUEUE_NOT_FOUND");
    }
    // 同一应用存在多个有效队列属于历史数据冲突；不得根据版本时间猜测要审核的
    // 版本，必须由对账或人工处理后再继续审核。
    if (activeCandidates.length > 1) {
      throw new Error("PORTAL_REVIEW_QUEUE_CONFLICT");
    }
    const current = activeCandidates[0]!;
    if (
      current.queue.status === "claimed" &&
      current.queue.claimedByEmployeeId !== actor.employeeId
    ) {
      throw new Error("PORTAL_REVIEW_CLAIMED_BY_OTHER");
    }
    return current.version.applicationVersionId;
  }

  private async readApplicationResource(
    actor: ActorContext,
    resourceId: string,
  ) {
    const resource = await this.repository.findResourceById(
      actor,
      "app",
      resourceId,
    );
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return resource;
  }

  private featuredQuery(): PortalListInput {
    return { sortBy: "score", page: 1, pageSize: 8, status: "published" };
  }

  private normalizeDraft(
    input: Pick<PortalDraftInput, "slug" | "name" | "summary">,
  ) {
    const slug = input.slug.trim().toLowerCase();
    if (!slugPattern.test(slug) || slug.length > 120) {
      throw new Error("PORTAL_SLUG_INVALID");
    }
    const name = input.name.trim();
    const summary = input.summary.trim();
    if (name.length < 2 || name.length > 160) {
      throw new Error("PORTAL_NAME_INVALID");
    }
    if (summary.length < 2 || summary.length > 2000) {
      throw new Error("PORTAL_SUMMARY_INVALID");
    }
    return { slug, name, summary };
  }

  private extractApplicationDraft(
    input: Pick<PortalDraftInput, "applicationDraft" | "metadata">,
    required: boolean,
  ): ApplicationDraft | null {
    const candidate = input.applicationDraft ?? input.metadata;
    if (candidate === undefined) {
      if (required) throw new Error("PORTAL_APP_DRAFT_REQUIRED");
      return null;
    }
    if (!isCompleteApplicationDraft(candidate)) {
      // 创建端点历史上允许携带 Portal 私有 metadata；它不是完整草稿时不再
      // 落入 application_drafts，但仍允许创建应用壳以保持旧请求兼容。
      if (!required && input.applicationDraft === undefined) return null;
      throw new Error("PORTAL_APP_DRAFT_REQUIRED");
    }
    return candidate;
  }

  private requireCompleteApplicationDraft(value: unknown): ApplicationDraft {
    if (!isCompleteApplicationDraft(value)) {
      throw new Error("PORTAL_APP_DRAFT_REQUIRED");
    }
    return value;
  }

  private normalizeReviewComment(
    value: string | undefined,
    fallback: string,
  ): string {
    const normalized = value?.trim();
    if (normalized === undefined || normalized.length === 0) return fallback;
    if (normalized.length > 4000) {
      throw new Error("PORTAL_REVIEW_COMMENT_INVALID");
    }
    return normalized;
  }

  private requireApplications(): ApplicationLifecycleService {
    if (this.applications === undefined) {
      throw new Error("PORTAL_APPLICATION_SERVICE_UNAVAILABLE");
    }
    return this.applications;
  }

  private async applicationCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DraftValidationError) throw error;
      const code =
        error instanceof Error ? error.message : "APPLICATION_REQUEST_FAILED";
      if (code.startsWith("PORTAL_")) throw new Error(code);
      throw new Error(
        applicationErrorMap[code] ?? `PORTAL_APPLICATION_${code}`,
      );
    }
  }

  private async requireOwned(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
  ) {
    const resource = await this.repository.findResourceById(
      actor,
      type,
      resourceId,
    );
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    if (resource.ownerEmployeeId !== actor.employeeId) {
      throw new Error("PORTAL_RESOURCE_OWNER_REQUIRED");
    }
    return resource;
  }

  private async requireOwnedOrPermission(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    permission: string,
  ) {
    const resource = await this.repository.findResourceById(
      actor,
      type,
      resourceId,
    );
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    if (
      resource.ownerEmployeeId !== actor.employeeId &&
      !hasPermission(actor, permission)
    ) {
      throw new Error("PORTAL_RESOURCE_OWNER_REQUIRED");
    }
    return resource;
  }
}

function isCompleteApplicationDraft(value: unknown): value is ApplicationDraft {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.name === "string" &&
    typeof draft.departmentId === "string" &&
    Array.isArray(draft.maintainerEmployeeIds) &&
    typeof draft.categoryId === "string" &&
    typeof draft.applicationType === "string" &&
    Array.isArray(draft.tagIds) &&
    isObject(draft.icon) &&
    Array.isArray(draft.screenshotAssetIds) &&
    typeof draft.summaryHtml === "string" &&
    (draft.manualHtml === null || typeof draft.manualHtml === "string") &&
    (draft.manualAssetId === null || typeof draft.manualAssetId === "string") &&
    (draft.examplesHtml === null || typeof draft.examplesHtml === "string") &&
    (draft.examplesAssetId === null ||
      typeof draft.examplesAssetId === "string") &&
    Array.isArray(draft.faq) &&
    Array.isArray(draft.audience) &&
    isObject(draft.risk) &&
    Array.isArray(draft.deliveries) &&
    typeof draft.version === "string" &&
    typeof draft.changelog === "string"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
