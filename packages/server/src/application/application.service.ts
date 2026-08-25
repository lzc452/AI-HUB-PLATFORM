import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
  type ApplicationDraft,
  type ApplicationDraftRecord,
  type DeliveryDraftItem,
  type DeliveryTarget,
} from "@ai-hub/contracts";
import type {
  ApplicationAuthorizationPort,
  ApplicationNotificationPort,
  ApplicationRepository,
  ApplicationRecord,
  ApplicationStatus,
  ApplicationVersionRecord,
  ApplicationWorkspace,
  ApplicationAdminListInput,
  ApplicationAdminListResult,
  ArtifactUploadRecord,
  AssetRecord,
  DeliveryChannel,
  DeliveryRecord,
  PendingCatalogItemRecord,
  ReviewDecision,
  ReviewQueueRecord,
  ReviewQueueView,
  ValidationCheckRecord,
  VersionDiffResult,
  VersionSnapshotRecord,
} from "./application.types.js";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";
import { assertSafeRichText, sanitizeRichText } from "./content-security.js";
import { addBusinessDays } from "../system/outbox/sla-reminder.worker.js";
import {
  DENY_ALL_WEB_TARGETS,
  validateWebTargetUrl,
  type ResolveHost,
  type WebTargetPolicy,
} from "../system/security/web-url-policy.js";
import { validateMiniProgramQr } from "./qr-code-validator.js";

export interface CreateApplicationInput {
  name: string;
  summary: string;
  maintainerEmployeeId?: string;
  departmentId?: string;
}

export interface CreateVersionInput {
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string | null;
  scanStatus: "passed";
  /** 制品未签名（signed=false）时，提交人是否已显式确认接受风险。 */
  acceptUnsigned?: boolean;
}

export interface CreateDeliveryInput {
  channel: DeliveryChannel;
  entryUrl: string;
  minClientVersion?: string;
  enabled: boolean;
  /** 交付目标元数据（desktop/mobile 的 OS/平台、mini_program 的平台与二维码）。 */
  targets?: readonly DeliveryTarget[];
}

/** 提交完整性校验问题。 */
export interface DraftValidationIssue {
  code: string;
  message: string;
}

/** 提交校验失败（携带问题列表，供 400 响应返回）。 */
export class DraftValidationError extends Error {
  constructor(public readonly issues: readonly DraftValidationIssue[]) {
    super("DRAFT_VALIDATION_FAILED");
    this.name = "DraftValidationError";
  }
}

const allowedActions = {
  create: "create",
  update: "update",
  review: "review",
  publish: "publish",
} as const;

const requiredDeliveryChannels: readonly DeliveryChannel[] = [
  "web",
  "desktop",
  "mobile",
  "mini_program",
];

/** 按应用类型映射发布所需的交付渠道；未知类型回退到四类齐全（保守）。 */
const requiredChannelsByType: Readonly<
  Record<string, readonly DeliveryChannel[]>
> = {
  web_app: ["web"],
  desktop_app: ["desktop"],
  mobile_app: ["mobile"],
  mini_program: ["mini_program"],
};

export class ApplicationService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly authorization: ApplicationAuthorizationPort,
    _artifactVerifier: import("./storage.port.js").ArtifactVerificationPort,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
    private readonly notifications?: ApplicationNotificationPort,
    /**
     * 内网 Web 交付 URL 白名单（规格 §11.3）。默认拒绝一切 Web 目标
     * （fail-closed）：装配点未显式提供策略时，web 渠道入口 URL 无法保存。
     */
    private readonly webTargetPolicy: WebTargetPolicy = DENY_ALL_WEB_TARGETS,
    /** DNS 解析端口（测试注入桩以保持确定性）。 */
    private readonly resolveWebTargetHost: ResolveHost = lookup,
    /**
     * 对象存储（读取小程序二维码资产 buffer 用）。未装配时小程序目标无法保存
     * （fail-closed，与 Web URL 白名单策略一致）。
     */
    private readonly objectStorage?: Pick<
      import("./storage.port.js").ObjectStoragePort,
      "get"
    >,
  ) {}

  async createApplication(
    actor: ActorContext,
    input: CreateApplicationInput,
  ): Promise<ApplicationRecord> {
    return this.repository.withTransaction((repository) =>
      this.createApplicationInTransaction(actor, input, repository),
    );
  }

  async createApplicationInTransaction(
    actor: ActorContext,
    input: CreateApplicationInput,
    repository: ApplicationRepository,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.create);
    const application = await repository.createApplication({
      ownerEmployeeId: actor.employeeId,
      maintainerEmployeeId: input.maintainerEmployeeId ?? actor.employeeId,
      departmentId: input.departmentId ?? actor.primaryDepartmentId,
      name: input.name,
      summary: input.summary,
    });
    await this.recordChange(
      repository,
      "application.created",
      application.applicationId,
      null,
      actor.employeeId,
    );
    return application;
  }

  async saveDraft(
    actor: ActorContext,
    applicationId: string,
    draft: ApplicationDraft,
  ): Promise<ApplicationDraftRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    // 已下架（withdrawn）应用允许重新编辑草稿：修改后可重新提交审核恢复上架；
    // 归档（archived）为终态，不再可编辑。
    if (application.status === "archived") {
      throw new Error("APPLICATION_NOT_EDITABLE");
    }
    const sanitizedDraft: ApplicationDraft = {
      ...draft,
      summaryHtml: sanitizeRichText(draft.summaryHtml),
      manualHtml:
        draft.manualHtml === null ? null : sanitizeRichText(draft.manualHtml),
      examplesHtml:
        draft.examplesHtml === null
          ? null
          : sanitizeRichText(draft.examplesHtml),
    };
    // 次级防御：白名单清洗后再用既有黑名单校验一遍（fail-closed）。
    assertSafeRichText(sanitizedDraft.summaryHtml);
    if (sanitizedDraft.manualHtml !== null)
      assertSafeRichText(sanitizedDraft.manualHtml);
    if (sanitizedDraft.examplesHtml !== null)
      assertSafeRichText(sanitizedDraft.examplesHtml);
    // 草稿 JSON 与维护人关联表在同一事务内写入：自审守卫优先读关联表
    // （isSelfReviewer），若中途失败只落一半，in_review 期间编辑草稿恰逢
    // 崩溃时，新加入的维护人可能绕过自审阻断——事务保证两者同生共死。
    await this.repository.withTransaction(async (repository) => {
      await repository.upsertDraft(applicationId, sanitizedDraft);
      // 同步持久化维护人列表（先删后插，主维护人 = 第一个），详情/工作区
      // 维护人显示与自审守卫读取该关联表（见 isSelfReviewer）。
      await repository.setMaintainers(
        applicationId,
        sanitizedDraft.maintainerEmployeeIds,
      );
    });
    return {
      applicationId,
      status: application.status,
      ownerEmployeeId: application.ownerEmployeeId,
      draft,
      updatedAt: new Date().toISOString(),
    };
  }

  async getDraft(
    actor: ActorContext,
    applicationId: string,
  ): Promise<ApplicationDraftRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      !hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)
    ) {
      throw new Error("APPLICATION_ACCESS_FORBIDDEN");
    }
    const result = await this.repository.findDraft(applicationId);
    if (result === null) throw new Error("DRAFT_NOT_FOUND");
    return {
      applicationId,
      status: application.status,
      ownerEmployeeId: application.ownerEmployeeId,
      draft: result.draft,
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  /** 提交草稿进入审核：完整性校验 → 规范化落库 → 创建无安装包版本 → 进入审核队列。 */
  async submitDraft(
    actor: ActorContext,
    applicationId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    // draft：首次提交；published：提交更新审核（保持目录可见）；
    // withdrawn：下架后重新提交审核恢复上架（审核通过自动发布，见 review）。
    if (
      application.status !== "draft" &&
      application.status !== "published" &&
      application.status !== "withdrawn"
    ) {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
    const result = await this.repository.findDraft(applicationId);
    if (result === null) throw new Error("DRAFT_NOT_FOUND");
    const draft = result.draft;

    // 提交审核前对富文本做白名单清洗（XSS 防护），并作为版本快照持久化。
    const sanitizedDraft: ApplicationDraft = {
      ...draft,
      summaryHtml: sanitizeRichText(draft.summaryHtml),
      manualHtml:
        draft.manualHtml === null ? null : sanitizeRichText(draft.manualHtml),
      examplesHtml:
        draft.examplesHtml === null
          ? null
          : sanitizeRichText(draft.examplesHtml),
    };
    // 次级防御：白名单清洗后再用既有黑名单校验一遍（fail-closed）。
    assertSafeRichText(sanitizedDraft.summaryHtml);
    if (sanitizedDraft.manualHtml !== null)
      assertSafeRichText(sanitizedDraft.manualHtml);
    if (sanitizedDraft.examplesHtml !== null)
      assertSafeRichText(sanitizedDraft.examplesHtml);

    const issues = validateDraftCompleteness(sanitizedDraft);
    if (issues.length > 0) throw new DraftValidationError(issues);

    const existingVersions = await this.repository.listVersions(applicationId);
    if (existingVersions.some((v) => v.version === draft.version)) {
      throw new Error("VERSION_ALREADY_EXISTS");
    }

    // 交付配置静态校验（事务外执行）：web 入口地址命中内网白名单（DNS 解析）、
    // targets 枚举/二维码内容校验（对象存储读取）均不可回滚——与
    // configureDelivery 的校验时机一致（被拒绝的 URL/target 根本不落库）。
    const validatedDeliveries = await this.validateDraftDeliveries(
      applicationId,
      sanitizedDraft.deliveries,
    );

    const plainSummary = draft.summaryHtml.replace(/<[^>]*>/g, "").trim();

    return this.repository.withTransaction(async (repository) => {
      await repository.updateApplicationContent(applicationId, {
        name: draft.name,
        summary: plainSummary,
      });
      // 功能 5c：自定义分类/标签（重名自动复用现有，其余写入 pending 待审表）。
      // 重名命中的现有分类/标签 id 立即关联：分类命中时元数据不再落 productivity
      // 兜底（catalog_categories 外键必填；审核通过后由 applyPendingCatalogItems
      // 覆盖为新建分类的 id，与 registerToCatalog 的兜底语义一致）；标签命中时
      // 并入 tagIds，命中的 id 不写 pending。
      const matchedCatalog = await this.persistPendingCatalogItems(
        repository,
        applicationId,
        sanitizedDraft,
      );
      await repository.upsertCatalogMetadata(applicationId, {
        categoryId:
          draft.categoryId.trim().length > 0
            ? draft.categoryId
            : (matchedCatalog.categoryId ?? "productivity"),
        applicationType: draft.applicationType,
      });
      // 去重合并：draft.tagIds 与重名命中的标签 id 可能重叠，
      // 重复 (application_id, tag_id) 会触发复合主键冲突。
      await repository.replaceTagLinks(applicationId, [
        ...new Set([...draft.tagIds, ...matchedCatalog.tagIds]),
      ]);
      await repository.replaceAudiences(applicationId, draft.audience);
      // 维护人列表随提交落库（先删后插）；提交门禁已保证非空。
      await repository.setMaintainers(
        applicationId,
        draft.maintainerEmployeeIds,
      );
      // 草稿交付配置落库为已启用渠道（功能 4：向导多选渠道直接落库，
      // 目录渠道不再依赖独立交付页逐渠道 PUT；静态校验已在事务外完成）。
      await this.persistDraftDeliveries(
        repository,
        applicationId,
        validatedDeliveries,
      );

      const version = await repository.createVersion({
        applicationVersionId: randomUUID(),
        applicationId,
        version: draft.version,
        changelog: draft.changelog,
        artifactKey: null,
        artifactSha256: null,
        artifactSignature: null,
        scanStatus: "passed",
        createdByEmployeeId: actor.employeeId,
      });
      await repository.snapshotVersionContent(
        version.applicationVersionId,
        sanitizedDraft,
      );

      const isPublishedUpdate = application.status === "published";
      const updated = await repository.setApplicationStatus({
        applicationId,
        expectedStatus: application.status,
        // 已发布应用提交更新审核时，保持 published（继续在目录可见）；
        // draft/withdrawn 提交审核进入 in_review（下架应用审核通过后自动重新上架，
        // 见 review 的 sourceStatus 恢复路径）。
        status: isPublishedUpdate ? "published" : "in_review",
        pendingVersionId: isPublishedUpdate
          ? version.applicationVersionId
          : null,
      });
      await repository.createReviewQueue({
        applicationId,
        applicationVersionId: version.applicationVersionId,
        status: "available",
        claimedByEmployeeId: null,
        claimedAt: null,
        slaDueAt: addBusinessDays(new Date(), 2),
        // 记录审核前的应用状态，驳回时据其正确回滚。
        sourceStatus: application.status,
      });
      await this.recordChange(
        repository,
        "application.submitted",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.requested",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.sla.created",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async createVersion(
    actor: ActorContext,
    applicationId: string,
    input: CreateVersionInput,
  ): Promise<ApplicationVersionRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    // 恢复路径（规格 §5.5）：下架/归档后的应用允许创建新版本，由其他应用
    // 管理员审核通过后重新上架——因此不再拒绝 archived/withdrawn 状态。
    if (input.scanStatus !== "passed") {
      throw new Error("ARTIFACT_NOT_VERIFIED");
    }
    const verifiedUpload = await this.repository.findVerifiedArtifact({
      applicationId,
      objectKey: input.artifactKey,
      sha256: input.artifactSha256,
      signature: input.artifactSignature ?? null,
    });
    if (verifiedUpload === null) {
      throw new Error("ARTIFACT_NOT_VERIFIED");
    }
    // 规格 §5.5：未签名制品必须由提交人显式确认风险后才能绑定为版本。
    if (verifiedUpload.signed === false && input.acceptUnsigned !== true) {
      throw new Error("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
    }
    const versions = await this.repository.listVersions(applicationId);
    if (versions.some((version) => version.version === input.version)) {
      throw new Error("VERSION_ALREADY_EXISTS");
    }

    return this.repository.withTransaction(async (repository) => {
      const version = await repository.createVersion({
        applicationVersionId: randomUUID(),
        applicationId,
        version: input.version,
        changelog: input.changelog,
        artifactKey: input.artifactKey,
        artifactSha256: input.artifactSha256,
        artifactSignature: input.artifactSignature,
        scanStatus: input.scanStatus,
        createdByEmployeeId: actor.employeeId,
      });
      await this.recordArtifactValidationChecks(
        repository,
        version.applicationVersionId,
        verifiedUpload,
      );
      await this.recordChange(
        repository,
        "application.version.created",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      return version;
    });
  }

  async listValidationChecks(
    applicationVersionId: string,
    actor?: ActorContext,
  ): Promise<readonly ValidationCheckRecord[]> {
    const version = await this.requireVersion(applicationVersionId);
    if (actor !== undefined) {
      const application = await this.requireApplication(version.applicationId);
      this.assertApplicationReadable(actor, application);
    }
    return this.repository.listValidationChecks(applicationVersionId);
  }

  /**
   * 制品校验发生在版本创建之前（上传→worker 校验→createVersion），因此校验检查点
   * 在版本事务内由已验证的 upload 记录派生落库（唯一键幂等 upsert）。
   *
   * 规格 §5.5：未签名制品（worker 以 signed=false 完成）在签名检查点落
   * warning，显著标记并进入人工确认——检查点本身不阻断，门禁在
   * createVersion / submitForReview 的 acceptUnsigned 校验。
   */
  private async recordArtifactValidationChecks(
    repository: ApplicationRepository,
    applicationVersionId: string,
    upload: ArtifactUploadRecord,
  ): Promise<void> {
    await repository.recordValidationCheck({
      applicationVersionId,
      checkCode: "artifact.digest",
      label: "SHA-256 摘要校验",
      status: "passed",
      detail: upload.sha256,
    });
    await repository.recordValidationCheck({
      applicationVersionId,
      checkCode: "artifact.malware_scan",
      label: "恶意软件扫描",
      status: "passed",
      detail: "ClamAV clean",
    });
    await repository.recordValidationCheck({
      applicationVersionId,
      checkCode: "artifact.signature",
      label: "签名校验",
      status: upload.signed === false ? "warning" : "passed",
      detail: upload.signed === false ? "未签名制品，需人工确认" : "签名有效",
    });
  }

  async submitForReview(
    actor: ActorContext,
    applicationVersionId: string,
    options?: { acceptUnsigned?: boolean },
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const version = await this.requireVersion(applicationVersionId);
    if (version.createdByEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (version.scanStatus !== "passed") {
      throw new Error("ARTIFACT_NOT_VERIFIED");
    }
    // 桌面端/移动端应用必须有安装包制品才能进入审核（P1-7）：submitDraft
    // 创建的无制品版本（artifactKey=null）不得直接提交审核，避免审核通过后
    // 发布没有任何安装包的版本。类型未知（catalog metadata 缺失的存量应用）
    // 时豁免——与 assertDeliveryChannelsComplete 的 typeKnown 豁免一致，
    // 无法判断类型时保持历史行为放行。
    const applicationType = await this.repository.getApplicationType(
      version.applicationId,
    );
    if (
      (applicationType === "desktop_app" || applicationType === "mobile_app") &&
      version.artifactKey === null
    ) {
      throw new Error("ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE");
    }
    // 规格 §5.5：带制品的版本在提交审核时再次校验未签名确认（提交点二次门禁）。
    if (version.artifactKey !== null && version.artifactSha256 !== null) {
      const upload = await this.repository.findVerifiedArtifact({
        applicationId: version.applicationId,
        objectKey: version.artifactKey,
        sha256: version.artifactSha256,
        signature: version.artifactSignature ?? null,
      });
      if (
        upload !== null &&
        upload.signed === false &&
        options?.acceptUnsigned !== true
      ) {
        throw new Error("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
      }
    }
    const application = await this.requireApplication(version.applicationId);
    // 草稿/已发布提交更新审核之外，下架/归档应用可通过新版本进入审核恢复上架
    // （规格 §5.5），sourceStatus 会记录恢复前状态供驳回回滚与通过置 published。
    if (
      !["draft", "published", "withdrawn", "archived"].includes(
        application.status,
      )
    ) {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
    // 已发布应用只能有一个待审核版本；存在 pending 版本时拒绝再次提交，
    // 避免多个版本同时在审核、pendingVersionId 相互覆盖。
    if (application.pendingVersionId !== null) {
      throw new Error("REVIEW_ALREADY_PENDING");
    }
    return this.repository.withTransaction(async (repository) => {
      const isPublishedUpdate = application.status === "published";
      const updated = await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: application.status,
        // 已发布应用提交更新审核时，保持 published（继续在目录可见）；
        // draft 提交审核才进入 in_review。
        status: isPublishedUpdate ? "published" : "in_review",
        pendingVersionId: isPublishedUpdate ? applicationVersionId : null,
      });
      await repository.createReviewQueue({
        applicationId: application.applicationId,
        applicationVersionId,
        status: "available",
        claimedByEmployeeId: null,
        claimedAt: null,
        slaDueAt: addBusinessDays(new Date(), 2),
        // 记录审核前的应用状态，驳回时据其正确回滚。
        sourceStatus: application.status,
      });
      await this.recordChange(
        repository,
        "application.submitted",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.requested",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.sla.created",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  /** 待审核版本在最终结论前可以由提交人撤回（规格 §5.5）。 */
  async cancelPendingReview(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const version = await this.requireVersion(applicationVersionId);
    if (version.createdByEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    const application = await this.requireApplication(version.applicationId);
    if (application.pendingVersionId !== applicationVersionId) {
      throw new Error("REVIEW_NOT_PENDING");
    }
    return this.repository.withTransaction(async (repository) => {
      // 删除队列行而非置 completed：application_review_queue.application_version_id
      // 有 UNIQUE 约束，保留终态行会阻塞同一版本撤回后的再次提交。
      await repository.deleteReviewQueue(applicationVersionId);
      // 功能 5c：撤回提交时清空该应用的待审自定义分类/标签（未出结论不生效）。
      await repository.deletePendingCatalogItemsByApplication(
        application.applicationId,
      );
      const updated = await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: "published",
        status: "published",
        pendingVersionId: null,
      });
      await this.recordChange(
        repository,
        "application.review.withdrawn",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  /** 功能 5c：审核员读取应用的待审自定义分类/标签列表。 */
  async listPendingCatalogItemsForReview(
    actor: ActorContext,
    applicationId: string,
  ): Promise<readonly PendingCatalogItemRecord[]> {
    await this.assertAuthorized(actor, allowedActions.review);
    await this.requireApplication(applicationId);
    return this.repository.listPendingCatalogItems(applicationId);
  }

  /**
   * 功能 5c：审核员删除应用的待审自定义分类/标签项。归属校验——item 不属于
   * 该应用（或不存在）时抛 PENDING_ITEM_NOT_FOUND（controller 映射 404）。
   */
  async deletePendingCatalogItem(
    actor: ActorContext,
    applicationId: string,
    itemId: string,
  ): Promise<void> {
    await this.assertAuthorized(actor, allowedActions.review);
    await this.requireApplication(applicationId);
    const pending =
      await this.repository.listPendingCatalogItems(applicationId);
    if (!pending.some((item) => item.itemId === itemId)) {
      throw new Error("PENDING_ITEM_NOT_FOUND");
    }
    await this.repository.deletePendingCatalogItem(itemId);
  }

  async claimReview(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord> {
    await this.assertAuthorized(actor, allowedActions.review);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    await this.assertNotSelfReview(actor, application);
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.status !== "available") {
      throw new Error("REVIEW_QUEUE_NOT_AVAILABLE");
    }
    const updated = await this.repository.withTransaction(
      async (repository) => {
        const claimed = await repository.claimReviewQueue(
          applicationVersionId,
          actor.employeeId,
        );
        await this.recordChange(
          repository,
          "application.review.claimed",
          application.applicationId,
          applicationVersionId,
          actor.employeeId,
        );
        return claimed;
      },
    );
    return updated;
  }

  async releaseReview(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord> {
    await this.assertAuthorized(actor, allowedActions.review);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.claimedByEmployeeId !== actor.employeeId) {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    return this.repository.withTransaction(async (repository) => {
      const released = await repository.releaseReviewQueue(
        applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.released",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return released;
    });
  }

  /** 超级管理员可以将已领取的审核任务转交给其他员工（规格 §5.5）。 */
  async transferReviewTask(
    actor: ActorContext,
    applicationVersionId: string,
    newClaimantEmployeeId: string,
  ): Promise<ReviewQueueRecord> {
    if (!hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)) {
      throw new Error("REVIEW_TRANSFER_FORBIDDEN");
    }
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.status !== "claimed") {
      throw new Error("REVIEW_QUEUE_NOT_CLAIMED");
    }
    // 转交目标不得是负责人或维护人：禁自审不可经转交绕过（规格 §5.5）。
    const application = await this.requireApplication(queue.applicationId);
    if (await this.isSelfReviewer(newClaimantEmployeeId, application)) {
      throw new Error("SELF_REVIEW_FORBIDDEN");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.transferReviewQueue(
        applicationVersionId,
        newClaimantEmployeeId,
      );
      await this.recordChange(
        repository,
        "application.review.transferred",
        queue.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async review(
    actor: ActorContext,
    applicationVersionId: string,
    decision: ReviewDecision,
    comment: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.review);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    // 负责人与维护人（草稿维护人列表或单维护人字段）在任何路径下都不得
    // 出结论，包括经超管转交后持有认领的情况（规格 §5.5 禁自审不可绕过）。
    await this.assertNotSelfReview(actor, application);
    // 已发布应用提交更新审核时，应用状态仍为 published（保持目录可见），
    // 因此审核入口允许 in_review 或 published；其余状态不合法。
    if (
      application.status !== "in_review" &&
      application.status !== "published"
    ) {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.claimedByEmployeeId !== actor.employeeId) {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    if (queue.status !== "claimed") {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    // 驳回与要求修改必须给出原因（规格 §5.5）；DTO 层已强制非空，
    // 这里对直接调用服务的情况做防御性校验。
    if (
      (decision === "reject" || decision === "request_changes") &&
      !comment?.trim()
    ) {
      throw new Error("REVIEW_COMMENT_REQUIRED");
    }
    // 依据审核前的应用状态决定终态：驳回回滚到原状态；通过时
    // 首次发布（审核前为 draft）直接置 published 并自动注册目录（自动上架），
    // 已发布应用的更新则保持 published 并切换当前版本。
    const approved = decision === "approve";
    const sourceStatus = (queue.sourceStatus ?? "draft") as ApplicationStatus;
    const nextStatus: ApplicationStatus = approved ? "published" : sourceStatus;
    const updated = await this.repository.withTransaction(
      async (repository) => {
        await repository.createReview({
          applicationId: application.applicationId,
          applicationVersionId,
          reviewerEmployeeId: actor.employeeId,
          applicationOwnerEmployeeId: application.ownerEmployeeId,
          decision,
          comment,
        });
        // 桌面端/移动端应用任何会激活版本的 approve 都必须有安装包制品
        // （P1-7）：向导 submitDraft 创建的无制品版本既不经过 submitForReview
        // 也不进自动上架分支（已发布应用更新审核走 currentVersionId 切换）——
        // 在版本激活前统一校验，覆盖首次发布、下架/归档恢复与发布更新三条
        // approve 路径。类型未知（catalog metadata 缺失的存量应用）时豁免，
        // 与 assertDeliveryChannelsComplete 的 typeKnown 豁免一致。
        if (approved) {
          const applicationType = await repository.getApplicationType(
            application.applicationId,
          );
          if (
            (applicationType === "desktop_app" ||
              applicationType === "mobile_app") &&
            version.artifactKey === null
          ) {
            throw new Error("ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE");
          }
        }
        // 功能 5c：自定义分类/标签随审核流转——通过时插入正式表并关联应用，
        // 驳回/要求修改时清空该应用的 pending 项（草稿回滚后可重新提交）。
        if (approved) {
          await this.applyPendingCatalogItems(
            repository,
            application.applicationId,
          );
        } else {
          await repository.deletePendingCatalogItemsByApplication(
            application.applicationId,
          );
        }
        const updated = await repository.setApplicationStatus({
          applicationId: application.applicationId,
          expectedStatus: application.status,
          status: nextStatus,
          // 审核结束，清除待生效版本标记。
          pendingVersionId: null,
          // 审核通过：切换当前版本为新审核版本（首次发布与发布态更新一致）。
          ...(approved ? { currentVersionId: applicationVersionId } : {}),
        });
        await this.recordChange(
          repository,
          "application.reviewed",
          application.applicationId,
          applicationVersionId,
          actor.employeeId,
        );
        // 首次发布（draft）与下架/归档恢复（withdrawn/archived）审核通过：
        // 自动上架——目录注册与发布事件在审核事务内完成，不再需要责任人手动
        // 调用 publish（等同原 publish 的效果，含渠道完整性门禁）。恢复路径的
        // registerToCatalog 为 upsert，对已注册过的应用幂等无害。
        if (
          approved &&
          (sourceStatus === "draft" ||
            sourceStatus === "withdrawn" ||
            sourceStatus === "archived")
        ) {
          await this.assertDeliveryChannelsComplete(
            repository,
            application.applicationId,
          );
          await repository.registerToCatalog({
            applicationId: application.applicationId,
            name: application.name,
            summary: application.summary,
          });
          await this.recordChange(
            repository,
            "application.published",
            application.applicationId,
            applicationVersionId,
            actor.employeeId,
          );
        }
        // 关闭审核队列，避免其以 available/claimed 残留。
        await repository.completeReviewQueue(applicationVersionId);
        return updated;
      },
    );
    await this.analyticsEvents?.record(actor, {
      eventName: "review_decided",
      aggregateType: "review",
      aggregateId: applicationVersionId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `review-decided:${applicationVersionId}:${decision}`,
      metadata: { decision },
    });
    return updated;
  }

  /** §5.4 发布前置校验：草稿所选交付渠道必须全部启用（publish 与自动上架共用）。 */
  private async assertDeliveryChannelsComplete(
    repository: ApplicationRepository,
    applicationId: string,
  ): Promise<void> {
    const deliveries = await repository.listDeliveries(applicationId);
    const applicationType = await repository.getApplicationType(applicationId);
    // 功能 4：发布门禁以草稿所选渠道为准（向导多选 + submitDraft 落库）。
    // 草稿缺失（遗留 publish 路径）或草稿未选任何渠道（未提交过的保存值）
    // 时回退到类型对应渠道（fail-closed：未知类型回退四类齐全，绝不放宽）。
    const draft = await repository.findDraft(applicationId);
    const draftChannels =
      draft !== null && Array.isArray(draft.draft.deliveries)
        ? draft.draft.deliveries.map((item) => item.channel)
        : [];
    const requiredChannels =
      draftChannels.length > 0
        ? draftChannels
        : applicationType !== null &&
            requiredChannelsByType[applicationType] !== undefined
          ? requiredChannelsByType[applicationType]
          : requiredDeliveryChannels;
    // 目标完整性门禁（规格 P1-11）：类型已知时按类型要求的渠道校验，
    // mini_program 渠道除启用外还必须有 ≥1 个 miniprogram 目标且二维码
    // 资产存在（二维码内容在 configureDelivery 保存时已校验）。
    //
    // typeKnown === false（application_catalog_metadata 缺失）豁免目标
    // 校验——这是**有意的历史兼容决策，不是安全漏洞**：
    // - 新应用创建即写类型（upsertCatalogMetadata / registerToCatalog 均以
    //   "web_app" 兜底），因此所有新应用必受目标门禁约束；
    // - 仅 0037 迁移之前或从未走草稿/目录注册路径的存量应用可能缺 metadata，
    //   此时按历史语义只查渠道启用（fail-closed 方向：未知类型回退为
    //   requiredDeliveryChannels——要求四个渠道全部启用，比已知类型
    //   （仅类型对应渠道）更严，绝不比已知类型宽松；只是不额外要求 target）。
    const typeKnown = applicationType !== null;
    for (const channel of requiredChannels) {
      const delivery = deliveries.find(
        (item) => item.channel === channel && item.enabled,
      );
      if (delivery === undefined) {
        throw new Error("DELIVERY_CHANNELS_INCOMPLETE");
      }
      if (channel === "mini_program" && typeKnown) {
        const targets = await repository.listDeliveryTargets(
          delivery.deliveryId,
        );
        const miniprogramTargets = targets.filter(
          (target) => target.kind === "miniprogram" && target.enabled,
        );
        if (miniprogramTargets.length === 0) {
          throw new Error("DELIVERY_TARGETS_INCOMPLETE");
        }
        for (const target of miniprogramTargets) {
          if (target.qrCodeAssetId === null) {
            throw new Error("DELIVERY_TARGETS_INCOMPLETE");
          }
          const asset = await repository.findAsset(target.qrCodeAssetId);
          if (asset === null) {
            throw new Error("DELIVERY_TARGETS_INCOMPLETE");
          }
        }
      }
    }
  }

  /**
   * 功能 5c：提交草稿时将自定义分类/标签写入待审表（catalog_pending_items）。
   * 重名（忽略大小写）自动复用现有正式分类/标签，不产生 pending 项；名称
   * 统一 trim 后落值（前后空白不原样入库）。
   *
   * @returns 重名命中的现有正式分类/标签 id（{ categoryId, tagIds }），供
   *   submitDraft 立即关联到应用（分类覆盖 productivity 兜底、标签并入
   *   tagIds）；未命中而写入 pending 的名称不在此列。
   */
  private async persistPendingCatalogItems(
    repository: ApplicationRepository,
    applicationId: string,
    draft: ApplicationDraft,
  ): Promise<{ categoryId: string | null; tagIds: string[] }> {
    let matchedCategoryId: string | null = null;
    const matchedTagIds: string[] = [];
    const categoryName = draft.customCategoryName?.trim();
    if (categoryName !== undefined && categoryName.length > 0) {
      const existingCategoryId =
        await repository.findCategoryByName(categoryName);
      if (existingCategoryId !== null) {
        matchedCategoryId = existingCategoryId;
      } else {
        await repository.upsertPendingCatalogItem(
          applicationId,
          "category",
          categoryName,
        );
      }
    }
    for (const name of draft.customTagNames ?? []) {
      const trimmed = name.trim();
      if (trimmed.length === 0) continue;
      const existingTagId = await repository.findTagByName(trimmed);
      if (existingTagId !== null) {
        matchedTagIds.push(existingTagId);
      } else {
        await repository.upsertPendingCatalogItem(
          applicationId,
          "tag",
          trimmed,
        );
      }
    }
    return { categoryId: matchedCategoryId, tagIds: matchedTagIds };
  }

  /**
   * 功能 5c：审核通过时把待审自定义分类/标签流转到正式表并关联应用：
   * - 分类插入 catalog_categories（uuid id），元数据 category_id 覆盖为新建 id；
   * - 标签插入 catalog_tags，并与应用现有标签链接合并（不覆盖）；
   * - 全部处理后清空该应用的 pending 项。
   */
  private async applyPendingCatalogItems(
    repository: ApplicationRepository,
    applicationId: string,
  ): Promise<void> {
    const pending = await repository.listPendingCatalogItems(applicationId);
    if (pending.length === 0) return;
    let appliedCategoryId: string | null = null;
    const appliedTagIds: string[] = [];
    for (const item of pending) {
      if (item.kind === "category") {
        appliedCategoryId = await repository.insertCategory(item.name);
      } else {
        appliedTagIds.push(await repository.insertTag(item.name));
      }
    }
    if (appliedCategoryId !== null) {
      const applicationType =
        await repository.getApplicationType(applicationId);
      await repository.upsertCatalogMetadata(applicationId, {
        categoryId: appliedCategoryId,
        applicationType: applicationType ?? "web_app",
      });
    }
    if (appliedTagIds.length > 0) {
      const existingTagIds = await repository.listTagIds(applicationId);
      // 合并去重：insertTag 按忽略大小写复用现有正式标签，pending 大小写变体
      // 或审批期间新增的正式标签都会让 appliedTagIds 与既有关联重叠 —— 重复
      // (application_id, tag_id) 会触发复合主键冲突导致事务回滚 500。
      await repository.replaceTagLinks(applicationId, [
        ...new Set([...existingTagIds, ...appliedTagIds]),
      ]);
    }
    await repository.deletePendingCatalogItemsByApplication(applicationId);
  }

  async publish(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "approved");
    await this.assertDeliveryChannelsComplete(
      this.repository,
      application.applicationId,
    );
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: "approved",
        status: "published",
        currentVersionId: applicationVersionId,
      });
      await repository.registerToCatalog({
        applicationId: application.applicationId,
        name: application.name,
        summary: application.summary,
      });
      await this.recordChange(
        repository,
        "application.published",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async withdraw(
    actor: ActorContext,
    applicationId: string,
    reason: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "published");
    return this.transition(
      application,
      "withdrawn",
      "application.withdrawn",
      reason,
      actor.employeeId,
    );
  }

  /** 责任人或维护人可以申请下架已发布应用（规格 §5.5）：仅写审计与站内通知
   *  （通知责任人），不改变应用状态——确认下架仍由 withdraw 执行。维护人判定
   *  与自审守卫一致：单维护人字段或草稿维护人列表（isSelfReviewer）。 */
  async requestWithdraw(
    actor: ActorContext,
    applicationId: string,
    reason: string,
  ): Promise<void> {
    const application = await this.requireApplication(applicationId);
    if (!(await this.isSelfReviewer(actor.employeeId, application))) {
      throw new Error("APPLICATION_MAINTAINER_REQUIRED");
    }
    this.requireStatus(application, "published");
    if (reason.trim().length === 0) {
      throw new Error("WITHDRAW_REASON_REQUIRED");
    }
    // 业务事务只写审计；站内通知在事务外发送（与 demand 模块一致），
    // 且通知失败不得回滚业务操作（规格 §5.8）——收件人取自事务前已读的应用记录。
    await this.repository.withTransaction(async (repository) => {
      await this.recordChange(
        repository,
        "application.withdraw.requested",
        applicationId,
        null,
        actor.employeeId,
        { reason, by: actor.employeeId },
      );
    });
    if (this.notifications !== undefined) {
      try {
        await this.notifications.queue(
          actor,
          "application.withdraw.requested",
          {
            recipientEmployeeId: application.ownerEmployeeId,
            aggregateId: applicationId,
            variables: { reason },
          },
        );
      } catch {
        // 规格 §5.8：外部通知失败不回滚业务操作——审计已提交，申请本身成立；
        // 钉钉通知为尽力投递（outbox at-least-once），失败由后续投递兜底。
      }
    }
  }

  async rollback(
    actor: ActorContext,
    applicationId: string,
    applicationVersionId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "published");
    const version = await this.requireVersion(applicationVersionId);
    if (version.applicationId !== applicationId) {
      throw new Error("APPLICATION_VERSION_MISMATCH");
    }
    if (version.applicationVersionId === application.currentVersionId) {
      throw new Error("ROLLBACK_TARGET_IS_CURRENT");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.setApplicationStatus({
        applicationId,
        expectedStatus: "published",
        status: "published",
        currentVersionId: applicationVersionId,
      });
      await this.recordChange(
        repository,
        "application.rolled_back",
        applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async archive(
    actor: ActorContext,
    applicationId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "withdrawn");
    return this.transition(
      application,
      "archived",
      "application.archived",
      undefined,
      actor.employeeId,
    );
  }

  /**
   * 提交前静态校验草稿交付配置（与 configureDelivery 同一套校验路径）：
   * - web 渠道 entryUrl 命中内网白名单（规格 §11.3；空 URL 视为尚未配置
   *   入口，跳过校验——与 configureDelivery 一致；空串/空 URL 已由
   *   validateDraftCompleteness 的逐渠道必填拦截）
   * - web 渠道不允许 targets
   * - 各渠道 targets 复用 validateDeliveryTargets（kind/platform 枚举、
   *   二维码资产存在性与归属、二维码内容格式），返回规范化后的 targets
   *   （小程序 appId 按二维码内容回填）
   * 校验含 DNS 解析与对象存储读取（不可回滚），必须在 submitDraft 事务外执行。
   */
  private async validateDraftDeliveries(
    applicationId: string,
    deliveries: readonly DeliveryDraftItem[],
  ): Promise<readonly DeliveryDraftItem[]> {
    const validated: DeliveryDraftItem[] = [];
    for (const item of deliveries) {
      if (item.channel === "web") {
        if (item.entryUrl !== null && item.entryUrl !== "") {
          await validateWebTargetUrl(
            item.entryUrl,
            this.webTargetPolicy,
            this.resolveWebTargetHost,
          );
        }
        if (item.targets && item.targets.length > 0) {
          throw new Error("DELIVERY_TARGETS_NOT_ALLOWED");
        }
      }
      const targets = await this.validateDeliveryTargets(
        applicationId,
        item.channel,
        item.targets ?? [],
      );
      validated.push(
        targets.length > 0 ? { ...item, targets: [...targets] } : item,
      );
    }
    return validated;
  }

  /**
   * 将草稿交付配置落库为已启用渠道（功能 4）：向导提交时把所选渠道写入
   * application_deliveries（createDelivery 为 UNIQUE(application_id, channel)
   * upsert，幂等），desktop/mobile/mini_program 的交付目标一并保存。
   * web 的入口地址在向导内填写；持久化时以空字符串兜底（entryUrl 为
   * string|null）。目标完整性（mini_program targets/二维码）由发布门禁
   * assertDeliveryChannelsComplete 校验。
   *
   * 草稿未选的渠道行会被删除（application_deliveries 按 application_id +
   * channel NOT IN (草稿渠道集) 删除，delivery_targets 经外键级联清除）：
   * 向导草稿是渠道配置的权威来源，用户从向导移除渠道后重提交，旧渠道不再
   * 出现在目录「立即使用」。权衡：独立交付页（ApplicationDeliveryPage 逐渠道
   * PUT）写入的渠道仅在该渠道仍留在草稿时保留 —— 向导重提交以草稿为准覆盖。
   */
  private async persistDraftDeliveries(
    repository: ApplicationRepository,
    applicationId: string,
    deliveries: readonly DeliveryDraftItem[],
  ): Promise<void> {
    for (const item of deliveries) {
      const delivery = await repository.createDelivery({
        applicationId,
        channel: item.channel,
        entryUrl: item.entryUrl ?? "",
        minClientVersion: item.minClientVersion,
        enabled: true,
      });
      if (item.targets && item.targets.length > 0) {
        await repository.saveDeliveryTargets(delivery.deliveryId, item.targets);
      }
      // 向导上传的安装包（assetIds）挂接到对应交付渠道，供目录下载。
      for (const [index, assetId] of (item.assetIds ?? []).entries()) {
        await repository.linkDeliveryAsset({
          applicationId,
          channel: item.channel,
          assetId,
          sortOrder: index,
        });
      }
    }
    await repository.deleteDeliveriesExcept(
      applicationId,
      deliveries.map((item) => item.channel),
    );
  }

  async configureDelivery(
    actor: ActorContext,
    applicationId: string,
    input: CreateDeliveryInput,
  ): Promise<DeliveryRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (application.status === "archived") {
      throw new Error("APPLICATION_NOT_EDITABLE");
    }
    // 内网 URL 白名单（规格 §11.3）：web 渠道的入口地址必须在保存前通过
    // 静态校验（协议/端口/主机名/DNS 解析 CIDR），被拒绝的 URL 根本不落库；
    // 发布/审核时无需重校（既有 entryUrl 视为已通过校验，恢复路径不重校）。
    // 空 URL 视为尚未配置入口，跳过校验；desktop/mobile/mini_program 的
    // 入口可能是外部下载地址，不套用内网 Web 白名单。重定向等运行时检查
    // 由健康检查（T19，HEAD 跟随）承担。
    if (input.channel === "web" && input.entryUrl !== "") {
      await validateWebTargetUrl(
        input.entryUrl,
        this.webTargetPolicy,
        this.resolveWebTargetHost,
      );
    }
    const targets = input.targets ?? [];
    if (input.channel === "web" && targets.length > 0) {
      throw new Error("DELIVERY_TARGETS_NOT_ALLOWED");
    }
    // 交付目标保存前校验：desktop/mobile 的 OS/平台枚举；mini_program 的平台
    // 枚举 + 二维码资产存在性 + 二维码内容格式（读取资产 buffer 后校验）。
    // 校验在事务外执行（对象存储读取不可回滚），不通过的 target 根本不落库。
    const validatedTargets = await this.validateDeliveryTargets(
      applicationId,
      input.channel,
      targets,
    );
    return this.repository.withTransaction(async (repository) => {
      const delivery = await repository.createDelivery({
        applicationId,
        channel: input.channel,
        entryUrl: input.entryUrl,
        minClientVersion: input.minClientVersion ?? null,
        enabled: input.enabled,
      });
      await repository.saveDeliveryTargets(
        delivery.deliveryId,
        validatedTargets,
      );
      await this.recordChange(
        repository,
        "application.delivery.configured",
        applicationId,
        null,
        actor.employeeId,
      );
      return delivery;
    });
  }

  /**
   * 校验交付目标集合（结构与渠道匹配 + 二维码内容）。返回规范化后的目标：
   * 小程序目标的 appId 为空时以二维码解析出的目标标识回填。
   */
  private async validateDeliveryTargets(
    applicationId: string,
    channel: DeliveryChannel,
    targets: readonly DeliveryTarget[],
  ): Promise<readonly DeliveryTarget[]> {
    const validated: DeliveryTarget[] = [];
    for (const target of targets) {
      if (channel === "desktop") {
        if (
          target.kind !== "desktop" ||
          (target.os !== "windows" && target.os !== "macos")
        ) {
          throw new Error("DELIVERY_TARGET_INVALID");
        }
        validated.push(target);
      } else if (channel === "mobile") {
        if (
          target.kind !== "mobile" ||
          (target.platform !== "android" && target.platform !== "ios")
        ) {
          throw new Error("DELIVERY_TARGET_INVALID");
        }
        validated.push(target);
      } else {
        // channel === "mini_program"（web 已在调用处拒绝 targets）
        if (
          target.kind !== "miniprogram" ||
          !["wechat", "dingtalk", "alipay"].includes(target.platform)
        ) {
          throw new Error("DELIVERY_TARGET_INVALID");
        }
        if (
          typeof target.qrCodeAssetId !== "string" ||
          target.qrCodeAssetId.length === 0
        ) {
          throw new Error("DELIVERY_TARGET_QR_REQUIRED");
        }
        const asset = await this.repository.findAsset(target.qrCodeAssetId);
        if (asset === null || asset.applicationId !== applicationId) {
          throw new Error("DELIVERY_TARGET_ASSET_NOT_FOUND");
        }
        const qrContent = await this.validateMiniProgramQrAsset(
          asset,
          target.platform,
        );
        validated.push(
          target.appId.trim().length > 0
            ? target
            : { ...target, appId: qrContent },
        );
      }
    }
    return validated;
  }

  /** 读取二维码资产 buffer 并校验内容格式，返回解析出的目标标识。 */
  private async validateMiniProgramQrAsset(
    asset: AssetRecord,
    platform: "wechat" | "dingtalk" | "alipay",
  ): Promise<string> {
    if (this.objectStorage === undefined) {
      throw new Error("QR_VALIDATION_UNAVAILABLE");
    }
    const content = await this.objectStorage.get(asset.storageKey);
    if (content === null) {
      throw new Error("QR_VALIDATION_UNAVAILABLE");
    }
    return validateMiniProgramQr(Buffer.from(content), platform);
  }

  async getApplication(
    applicationId: string,
    actor?: ActorContext,
  ): Promise<ApplicationRecord> {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
      await this.analyticsEvents?.record(actor, {
        eventName: "application_viewed",
        aggregateType: "application",
        aggregateId: applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-viewed:${actor.sessionId}:${applicationId}:${Date.now()}`,
        metadata: { source: "application.get" },
        audience: { departmentId: application.departmentId },
      });
    }
    return application;
  }

  async listAdmin(
    actor: ActorContext,
    input: ApplicationAdminListInput,
  ): Promise<ApplicationAdminListResult> {
    if (input.page < 1 || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error("APPLICATION_PAGINATION_INVALID");
    }
    if (this.repository.listAdmin === undefined) {
      throw new Error("APPLICATION_ADMIN_LIST_UNAVAILABLE");
    }
    return this.repository.listAdmin(actor, input);
  }

  async getAdminKpis(actor: ActorContext) {
    if (this.repository.getAdminKpis === undefined) {
      throw new Error("APPLICATION_ADMIN_KPIS_UNAVAILABLE");
    }
    return this.repository.getAdminKpis(actor);
  }

  async listVersions(applicationId: string, actor?: ActorContext) {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    return this.repository.listVersions(applicationId);
  }

  /** 读取版本快照：授权（APPLICATION_READ + 可读性）+ 版本属于该应用校验 +
   *  无快照记录返回 VERSION_SNAPSHOT_NOT_FOUND（404）。不可读（他人应用）
   *  按规格 §11.2 隐藏存在性，返回 404 APPLICATION_NOT_FOUND。 */
  async getVersionSnapshot(
    actor: ActorContext,
    applicationId: string,
    versionId: string,
  ): Promise<VersionSnapshotRecord> {
    await this.requireReadableApplication(actor, applicationId);
    const version = await this.requireVersion(versionId);
    if (version.applicationId !== applicationId) {
      throw new Error("APPLICATION_VERSION_NOT_FOUND");
    }
    const snapshot = await this.repository.findVersionSnapshot(versionId);
    if (snapshot === null) throw new Error("VERSION_SNAPSHOT_NOT_FOUND");
    return snapshot;
  }

  /** 两版本快照顶层字段级差异（from → to）。任一版本无快照记录返回
   *  VERSION_SNAPSHOT_NOT_FOUND（404）；不可读（他人应用）按规格 §11.2
   *  隐藏存在性，返回 404 APPLICATION_NOT_FOUND。 */
  async getVersionDiff(
    actor: ActorContext,
    applicationId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<VersionDiffResult> {
    await this.requireReadableApplication(actor, applicationId);
    const fromVersion = await this.requireVersion(fromVersionId);
    if (fromVersion.applicationId !== applicationId) {
      throw new Error("APPLICATION_VERSION_NOT_FOUND");
    }
    const toVersion = await this.requireVersion(toVersionId);
    if (toVersion.applicationId !== applicationId) {
      throw new Error("APPLICATION_VERSION_NOT_FOUND");
    }
    const [fromSnapshot, toSnapshot] = await Promise.all([
      this.repository.findVersionSnapshot(fromVersionId),
      this.repository.findVersionSnapshot(toVersionId),
    ]);
    if (fromSnapshot === null || toSnapshot === null) {
      throw new Error("VERSION_SNAPSHOT_NOT_FOUND");
    }
    return diffVersionSnapshots(fromSnapshot.payload, toSnapshot.payload);
  }

  async getWorkspace(
    applicationId: string,
    actor?: ActorContext,
  ): Promise<ApplicationWorkspace> {
    const application = await this.getApplication(applicationId, actor);
    const [versions, deliveries, reviews, assets, applicationType] =
      await Promise.all([
        this.repository.listVersions(applicationId),
        this.repository.listDeliveries(applicationId),
        this.repository.listReviews(applicationId),
        this.repository.listAssets(applicationId),
        this.repository.getApplicationType(applicationId),
      ]);
    const latestVersion = versions[0];
    const reviewQueue = latestVersion
      ? await this.repository.findReviewQueueByVersion(
          latestVersion.applicationVersionId,
        )
      : null;
    const meta = await this.repository.findApplicationMeta(applicationId);
    return {
      application,
      applicationType,
      ownerName: meta?.ownerName ?? "",
      maintainerName: meta?.maintainerName ?? "",
      departmentName: meta?.departmentName ?? "",
      updatedAt: (meta?.updatedAt ?? new Date()).toISOString(),
      versions,
      deliveries,
      reviews,
      reviewQueue,
      assets,
    };
  }

  async listDeliveries(applicationId: string, actor?: ActorContext) {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    return this.repository.listDeliveries(applicationId);
  }

  async listReviews(applicationId: string, actor?: ActorContext) {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    return this.repository.listReviews(applicationId);
  }

  async getReviewQueue(
    applicationVersionId: string,
    actor?: ActorContext,
  ): Promise<ReviewQueueView> {
    const queue = await this.requireReviewQueue(applicationVersionId);
    const result: ReviewQueueView = {
      ...queue,
      slaStatus: queue.slaDueAt.getTime() < Date.now() ? "overdue" : "on_time",
    };
    if (result.slaStatus === "overdue") {
      await this.analyticsEvents?.record(actor ?? null, {
        eventName: "review_sla_breached",
        aggregateType: "review",
        aggregateId: applicationVersionId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `review-sla-breached:${applicationVersionId}:${queue.slaDueAt.toISOString()}`,
        metadata: { source: "review.queue" },
      });
    }
    return result;
  }

  async getPublishedVersion(
    applicationId: string,
    actor?: ActorContext,
  ): Promise<ApplicationVersionRecord> {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    if (application.currentVersionId === null) {
      throw new Error("PUBLISHED_VERSION_NOT_FOUND");
    }
    const version = await this.repository.findVersion(
      application.currentVersionId,
    );
    if (version === null) throw new Error("PUBLISHED_VERSION_NOT_FOUND");
    if (actor !== undefined) {
      await this.analyticsEvents?.record(actor, {
        eventName: "application_delivered",
        aggregateType: "application",
        aggregateId: applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-delivered:${actor.sessionId}:${applicationId}:${version.applicationVersionId}:${Date.now()}`,
        metadata: { source: "application.published-version" },
        audience: { departmentId: application.departmentId },
      });
    }
    return version;
  }

  /**
   * 删除草稿应用：仅允许负责人删除 status=draft 的应用，级联清理子表数据，
   * 写入审计与 outbox 事件（先落事件再删主记录，避免审计外键受限）。
   */
  async deleteApplication(
    actor: ActorContext,
    applicationId: string,
  ): Promise<void> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (application.status !== "draft") {
      throw new Error("APPLICATION_DELETE_STATUS_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      await this.recordChange(
        repository,
        "application.deleted",
        applicationId,
        null,
        actor.employeeId,
        { name: application.name },
      );
      await repository.deleteDraftApplication(applicationId);
    });
  }

  /** 移交责任人：负责人本人或应用管理员可将应用移交给在职员工。 */
  async transferOwner(
    actor: ActorContext,
    applicationId: string,
    newOwnerEmployeeId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      !hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)
    ) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (newOwnerEmployeeId === application.ownerEmployeeId) {
      throw new Error("OWNER_UNCHANGED");
    }
    if (application.status === "archived") {
      throw new Error("APPLICATION_NOT_EDITABLE");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.transferOwner(
        applicationId,
        newOwnerEmployeeId,
      );
      if (updated === null) throw new Error("APPLICATION_NOT_FOUND");
      await this.recordChange(
        repository,
        "application.owner.transferred",
        applicationId,
        null,
        actor.employeeId,
        {
          from: application.ownerEmployeeId,
          to: newOwnerEmployeeId,
        },
      );
      return updated;
    });
  }

  private async transition(
    application: ApplicationRecord,
    status: ApplicationRecord["status"],
    eventType: string,
    reason?: string,
    actorEmployeeId?: string,
    applicationVersionId?: string,
  ) {
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: application.status,
        status,
      });
      await this.recordChange(
        repository,
        eventType,
        application.applicationId,
        applicationVersionId ?? application.currentVersionId,
        actorEmployeeId ?? null,
        reason === undefined ? undefined : { reason },
      );
      return updated;
    });
  }

  private async assertAuthorized(
    actor: ActorContext,
    action: string,
  ): Promise<void> {
    const decision = await this.authorization.authorize({
      actor,
      action,
      resourceType: "application",
    });
    if (!decision.allowed) throw new Error("NOT_AUTHORIZED");
  }

  /** 判断员工是否为该应用的负责人或维护人（自审者）。维护人列表以
   *  application_maintainers 关联表为准（saveDraft/submitDraft 已同步写入，
   *  0049 迁移回填了存量单维护人）；关联表为空（从未保存过维护人的历史数据）
   *  回退到草稿维护人列表与 applications.maintainer_employee_id 单维护人字段。 */
  private async isSelfReviewer(
    employeeId: string,
    application: ApplicationRecord,
  ): Promise<boolean> {
    if (application.ownerEmployeeId === employeeId) return true;
    const maintainerIds = await this.repository.listMaintainers(
      application.applicationId,
    );
    if (maintainerIds.length > 0) return maintainerIds.includes(employeeId);
    const draft = await this.repository.findDraft(application.applicationId);
    const draftMaintainerIds = draft?.draft.maintainerEmployeeIds ?? [];
    return (
      application.maintainerEmployeeId === employeeId ||
      draftMaintainerIds.includes(employeeId)
    );
  }

  /** 负责人与维护人不得自审（规格 §5.5）：认领与出结论路径共用。 */
  private async assertNotSelfReview(
    actor: ActorContext,
    application: ApplicationRecord,
  ): Promise<void> {
    if (await this.isSelfReviewer(actor.employeeId, application)) {
      throw new Error("SELF_REVIEW_FORBIDDEN");
    }
  }

  private assertApplicationReadable(
    actor: ActorContext,
    application: ApplicationRecord,
  ): void {
    if (
      application.ownerEmployeeId === actor.employeeId ||
      application.maintainerEmployeeId === actor.employeeId ||
      hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)
    ) {
      return;
    }
    throw new Error("APPLICATION_ACCESS_FORBIDDEN");
  }

  /** 快照/差异读取的可见性校验：与 assertApplicationReadable 同条件，但按
   *  规格 §11.2（权限拒绝不暴露受限对象是否存在）对不可读对象返回 404
   *  APPLICATION_NOT_FOUND 而非 403。 */
  private async requireReadableApplication(
    actor: ActorContext,
    applicationId: string,
  ): Promise<ApplicationRecord> {
    const application = await this.requireApplication(applicationId);
    if (
      application.ownerEmployeeId === actor.employeeId ||
      application.maintainerEmployeeId === actor.employeeId ||
      hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)
    ) {
      return application;
    }
    throw new Error("APPLICATION_NOT_FOUND");
  }

  private async requireApplication(
    applicationId: string,
  ): Promise<ApplicationRecord> {
    const application = await this.repository.findApplication(applicationId);
    if (application === null) throw new Error("APPLICATION_NOT_FOUND");
    return application;
  }

  private async requireVersion(
    applicationVersionId: string,
  ): Promise<ApplicationVersionRecord> {
    const version = await this.repository.findVersion(applicationVersionId);
    if (version === null) throw new Error("APPLICATION_VERSION_NOT_FOUND");
    return version;
  }

  private async requireReviewQueue(
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord> {
    const queue =
      await this.repository.findReviewQueueByVersion(applicationVersionId);
    if (queue === null) throw new Error("REVIEW_QUEUE_NOT_FOUND");
    return queue;
  }

  private requireStatus(
    application: ApplicationRecord,
    expected: ApplicationRecord["status"],
  ): void {
    if (application.status !== expected) {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
  }

  private async recordChange(
    repository: ApplicationRepository,
    eventType: string,
    applicationId: string,
    applicationVersionId: string | null,
    actorEmployeeId: string | null,
    details?: unknown,
  ): Promise<void> {
    await repository.recordAudit({
      applicationId,
      applicationVersionId,
      actorEmployeeId,
      eventType,
      details,
    });
    await repository.emitOutbox({
      applicationId,
      applicationVersionId,
      eventType,
      details,
    });
  }
}

/**
 * 提交完整性门禁（纯函数，可单测）。
 *
 * 返回问题列表；为空数组即表示草稿可提交。与前端 `superRefine` 采用同一套规则，
 * 服务端为最终权威，避免前端被绕过。
 */
export function validateDraftCompleteness(
  draft: ApplicationDraft,
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const fail = (code: string, message: string): void => {
    issues.push({ code, message });
  };

  if (typeof draft.name !== "string" || draft.name.trim().length === 0) {
    fail("DRAFT_NAME_REQUIRED", "应用名称不能为空");
  } else if (draft.name.length > 160) {
    fail("DRAFT_NAME_TOO_LONG", "应用名称不能超过 160 字");
  }
  if (
    typeof draft.departmentId !== "string" ||
    draft.departmentId.length === 0
  ) {
    fail("DRAFT_DEPARTMENT_REQUIRED", "归属部门不能为空");
  }
  // 功能 5c：分类门禁放宽为「分类 ID 或自定义分类名称至少其一」（trim 后非空）——
  // 前端选择自定义分类时 categoryId 为空、名称走 customCategoryName。
  const categoryIdValue =
    typeof draft.categoryId === "string" ? draft.categoryId.trim() : "";
  const customCategoryValue =
    typeof draft.customCategoryName === "string"
      ? draft.customCategoryName.trim()
      : "";
  if (categoryIdValue.length === 0 && customCategoryValue.length === 0) {
    fail("DRAFT_CATEGORY_REQUIRED", "分类不能为空");
  }
  if (
    !Array.isArray(draft.maintainerEmployeeIds) ||
    draft.maintainerEmployeeIds.length === 0
  ) {
    fail("DRAFT_MAINTAINER_REQUIRED", "至少指定一名维护人");
  }

  const icon = draft.icon;
  if (icon === undefined || icon === null) {
    fail("DRAFT_ICON_REQUIRED", "应用图标不能为空");
  } else if (icon.mode === "auto") {
    if (
      typeof icon.backgroundColor !== "string" ||
      icon.backgroundColor.trim().length === 0
    ) {
      fail("DRAFT_ICON_BACKGROUND_REQUIRED", "自动图标需指定背景色");
    }
  } else if (icon.mode === "upload") {
    if (typeof icon.assetId !== "string" || icon.assetId.length === 0) {
      fail("DRAFT_ICON_ASSET_REQUIRED", "上传图标需指定图标资产");
    }
  } else {
    fail("DRAFT_ICON_MODE_INVALID", "图标模式非法");
  }

  if (
    !Array.isArray(draft.screenshotAssetIds) ||
    draft.screenshotAssetIds.length < 1 ||
    draft.screenshotAssetIds.length > 6
  ) {
    fail("DRAFT_SCREENSHOTS_COUNT", "截图数量需在 1–6 张之间");
  }

  if (
    typeof draft.summaryHtml !== "string" ||
    draft.summaryHtml.trim().length === 0
  ) {
    fail("DRAFT_SUMMARY_REQUIRED", "简介不能为空");
  }
  const hasManual =
    (typeof draft.manualHtml === "string" &&
      draft.manualHtml.trim().length > 0) ||
    (typeof draft.manualAssetId === "string" && draft.manualAssetId.length > 0);
  if (!hasManual) {
    fail("DRAFT_MANUAL_REQUIRED", "操作手册需提供富文本或附件");
  }
  const hasExamples =
    (typeof draft.examplesHtml === "string" &&
      draft.examplesHtml.trim().length > 0) ||
    (typeof draft.examplesAssetId === "string" &&
      draft.examplesAssetId.length > 0);
  if (!hasExamples) {
    fail("DRAFT_EXAMPLES_REQUIRED", "使用示例需提供富文本或附件");
  }

  // 规格 §5.4：常见问题必填，且每条须同时包含问题与答案（fail-closed：
  // 非字符串/空串均拒绝，防止绕过前端直接调提交接口）。
  if (
    !Array.isArray(draft.faq) ||
    draft.faq.length === 0 ||
    draft.faq.some(
      (entry) =>
        entry === null ||
        typeof entry.question !== "string" ||
        entry.question.trim().length === 0 ||
        typeof entry.answer !== "string" ||
        entry.answer.trim().length === 0,
    )
  ) {
    fail("DRAFT_FAQ_REQUIRED", "请至少填写一条常见问题（含问题与答案）");
  }

  if (!Array.isArray(draft.audience) || draft.audience.length === 0) {
    fail("DRAFT_AUDIENCE_REQUIRED", "受众规则至少一条");
  }

  const risk = draft.risk;
  if (risk === undefined || risk === null) {
    fail("DRAFT_RISK_REQUIRED", "AI 风险声明不能为空");
  } else {
    const booleans = [
      risk.handlesSensitiveData,
      risk.sendsDataExternally,
      risk.retainsConversations,
      risk.affectsHighRiskDecisions,
    ];
    if (booleans.some((value) => typeof value !== "boolean")) {
      fail("DRAFT_RISK_OPTION_REQUIRED", "AI 风险选项需逐项选择是/否");
    }
    if (
      !Array.isArray(risk.modelProviders) ||
      risk.modelProviders.length === 0
    ) {
      fail("DRAFT_RISK_PROVIDER_REQUIRED", "需选择模型 / AI 提供方");
    }
    if (
      typeof risk.inputRestrictionDisclaimer !== "string" ||
      risk.inputRestrictionDisclaimer.trim().length === 0
    ) {
      fail("DRAFT_RISK_DISCLAIMER_REQUIRED", "免责声明不能为空");
    }
  }

  if (!Array.isArray(draft.deliveries) || draft.deliveries.length === 0) {
    fail("DRAFT_DELIVERY_REQUIRED", "交付配置不能为空");
  } else {
    // 功能 4 逐渠道必填（与前端 deliveryDraftItemSchema 同源规则）：
    // web 需入口地址；desktop/mobile 需 ≥1 个目标；mini_program 无额外必填。
    for (const item of draft.deliveries) {
      if (item.channel === "web") {
        if (
          typeof item.entryUrl !== "string" ||
          item.entryUrl.trim().length === 0
        ) {
          fail(
            "DRAFT_DELIVERY_WEB_ENTRY_URL_REQUIRED",
            "Web 渠道需填写入口地址",
          );
        }
      } else if (item.channel === "desktop" || item.channel === "mobile") {
        if (!Array.isArray(item.targets) || item.targets.length < 1) {
          fail(
            "DRAFT_DELIVERY_TARGETS_REQUIRED",
            "请至少选择一个目标系统/平台",
          );
        }
      }
    }
  }

  return issues;
}

/** 顶层字段级快照对比（from → to）。值用 JSON 序列化比较；顶层字段集合
 *  的差集归入 added/removed。非对象顶层（如 null/数组）整体对比，差异归入
 *  changed 的 "$" 字段。结果按字段名字母序排序保证确定性（PostgreSQL jsonb
 *  按长度/字节序存储键，不保证插入顺序）。 */
export function diffVersionSnapshots(
  from: unknown,
  to: unknown,
): VersionDiffResult {
  const serialize = (value: unknown): string => JSON.stringify(value ?? null);
  const changed: VersionDiffResult["changed"] = [];
  const added: VersionDiffResult["added"] = [];
  const removed: VersionDiffResult["removed"] = [];
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (isPlainObject(from) && isPlainObject(to)) {
    const fromKeys = Object.keys(from).sort();
    const toKeys = Object.keys(to).sort();
    const toKeySet = new Set(toKeys);
    for (const key of toKeys) {
      if (!Object.prototype.hasOwnProperty.call(from, key)) {
        added.push({ field: key, value: to[key] });
      }
    }
    for (const key of fromKeys) {
      if (!Object.prototype.hasOwnProperty.call(to, key)) {
        removed.push({ field: key, value: from[key] });
      }
    }
    for (const key of fromKeys) {
      if (toKeySet.has(key) && serialize(from[key]) !== serialize(to[key])) {
        changed.push({ field: key, from: from[key], to: to[key] });
      }
    }
  } else if (serialize(from) !== serialize(to)) {
    changed.push({ field: "$", from, to });
  }
  return { changed, added, removed };
}
