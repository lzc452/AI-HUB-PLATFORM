import type { DatabaseSchema } from "@ai-hub/database";
import type { Kysely, Selectable } from "kysely";
import { randomUUID } from "node:crypto";
import type {
  ApplicationRecord,
  ApplicationRepository,
  ApplicationVersionRecord,
  ArtifactUploadRecord,
  AssetRecord,
  DeliveryRecord,
  ReviewQueueRecord,
  ReviewRecord,
  ApplicationAdminListInput,
  ApplicationAdminListResult,
  DeliveryChannel,
} from "./application.types.js";
import type {
  ActorContext,
  ApplicationDraft,
  AudienceRule,
  ApplicationAdminKpis,
} from "@ai-hub/contracts";

export class KyselyApplicationRepository implements ApplicationRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: ApplicationRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyApplicationRepository(transaction)),
      );
  }

  async createApplication(input: {
    ownerEmployeeId: string;
    maintainerEmployeeId: string;
    departmentId: string;
    name: string;
    summary: string;
  }): Promise<ApplicationRecord> {
    const row = await this.db
      .insertInto("applications")
      .values({
        owner_employee_id: input.ownerEmployeeId,
        maintainer_employee_id: input.maintainerEmployeeId,
        department_id: input.departmentId,
        name: input.name,
        summary: input.summary,
        status: "draft",
        current_version_id: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapApplication(row);
  }

  /**
   * 级联删除草稿应用及其子表数据（仅允许草稿状态，由服务层校验）。
   * 由服务层 withTransaction 包裹，此处直接基于当前 db（事务）顺序执行。
   */
  async deleteDraftApplication(applicationId: string): Promise<void> {
    const deliveryIds = await this.db
      .selectFrom("application_deliveries")
      .select("delivery_id")
      .where("application_id", "=", applicationId)
      .execute();
    if (deliveryIds.length > 0) {
      await this.db
        .deleteFrom("application_delivery_assets")
        .where(
          "delivery_id",
          "in",
          deliveryIds.map((row) => row.delivery_id),
        )
        .execute();
    }
    const versionIds = await this.db
      .selectFrom("application_versions")
      .select("application_version_id")
      .where("application_id", "=", applicationId)
      .execute();
    if (versionIds.length > 0) {
      const versionIdList = versionIds.map((row) => row.application_version_id);
      await this.db
        .deleteFrom("application_version_snapshots")
        .where("application_version_id", "in", versionIdList)
        .execute();
      await this.db
        .deleteFrom("application_validation_checks")
        .where("application_version_id", "in", versionIdList)
        .execute();
    }
    await this.db
      .deleteFrom("application_assets")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_artifact_uploads")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_audit_events")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_likes")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_ratings")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_comments")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_feedback")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_reports")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("catalog_delivery_actions")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_catalog_labels")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("ai_demand_applications")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .updateTable("ai_demand_pilots")
      .set({ application_id: null })
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_deliveries")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_reviews")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_review_queue")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_versions")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_drafts")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_catalog_metadata")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_tag_links")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("application_audiences")
      .where("application_id", "=", applicationId)
      .execute();
    await this.db
      .deleteFrom("applications")
      .where("application_id", "=", applicationId)
      .execute();
  }

  /** 移交责任人：目标员工必须存在且在职，成功后返回更新后的应用。 */
  async transferOwner(
    applicationId: string,
    newOwnerEmployeeId: string,
  ): Promise<ApplicationRecord | null> {
    const employee = await this.db
      .selectFrom("employees")
      .select(["employee_id", "status"])
      .where("employee_id", "=", newOwnerEmployeeId)
      .executeTakeFirst();
    if (employee === undefined) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }
    if (employee.status !== "active") {
      throw new Error("EMPLOYEE_NOT_ACTIVE");
    }
    const row = await this.db
      .updateTable("applications")
      .set({
        owner_employee_id: newOwnerEmployeeId,
        updated_at: new Date(),
      })
      .where("application_id", "=", applicationId)
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapApplication(row);
  }

  async findApplication(
    applicationId: string,
  ): Promise<ApplicationRecord | null> {
    const row = await this.db
      .selectFrom("applications")
      .selectAll()
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapApplication(row);
  }

  /** 查询应用详情展示所需的姓名与更新时间（负责人/维护人/部门名称）。 */
  async findApplicationMeta(applicationId: string): Promise<{
    ownerName: string;
    maintainerName: string;
    departmentName: string;
    updatedAt: Date;
  } | null> {
    const row = await this.db
      .selectFrom("applications as application")
      .innerJoin(
        "employees as owner",
        "owner.employee_id",
        "application.owner_employee_id",
      )
      .leftJoin(
        "employees as maintainer",
        "maintainer.employee_id",
        "application.maintainer_employee_id",
      )
      .leftJoin(
        "departments as department",
        "department.department_id",
        "application.department_id",
      )
      .select([
        "owner.display_name as ownerName",
        "maintainer.display_name as maintainerName",
        "department.name as departmentName",
        "application.updated_at as updatedAt",
      ])
      .where("application.application_id", "=", applicationId)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      ownerName: row.ownerName,
      maintainerName: row.maintainerName ?? "",
      departmentName: row.departmentName ?? "",
      updatedAt: row.updatedAt,
    };
  }

  async upsertDraft(
    applicationId: string,
    draft: ApplicationDraft,
  ): Promise<void> {
    await this.db
      .insertInto("application_drafts")
      .values({ application_id: applicationId, draft })
      .onConflict((oc) =>
        oc.column("application_id").doUpdateSet({
          draft,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  async findDraft(
    applicationId: string,
  ): Promise<{ draft: ApplicationDraft; updatedAt: Date } | null> {
    const row = await this.db
      .selectFrom("application_drafts")
      .select(["draft", "updated_at"])
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    return row === undefined
      ? null
      : { draft: row.draft as ApplicationDraft, updatedAt: row.updated_at };
  }

  async updateApplicationContent(
    applicationId: string,
    input: { name: string; summary: string },
  ): Promise<void> {
    await this.db
      .updateTable("applications")
      .set({ name: input.name, summary: input.summary, updated_at: new Date() })
      .where("application_id", "=", applicationId)
      .execute();
  }

  async upsertCatalogMetadata(
    applicationId: string,
    input: { categoryId: string; applicationType: string },
  ): Promise<void> {
    await this.db
      .insertInto("application_catalog_metadata")
      .values({
        application_id: applicationId,
        category_id: input.categoryId,
        application_type: input.applicationType,
        search_name: "",
        search_summary: "",
        search_pinyin: "",
        search_initials: "",
        recommendation_rank: 0,
        health_status: "unknown",
        deprecated_reason: null,
        replacement_application_id: null,
      })
      .onConflict((oc) =>
        oc.column("application_id").doUpdateSet({
          category_id: input.categoryId,
          application_type: input.applicationType,
        }),
      )
      .execute();
  }

  async replaceTagLinks(
    applicationId: string,
    tagIds: readonly string[],
  ): Promise<void> {
    await this.db
      .deleteFrom("application_tag_links")
      .where("application_id", "=", applicationId)
      .execute();
    if (tagIds.length > 0) {
      await this.db
        .insertInto("application_tag_links")
        .values(
          tagIds.map((tagId) => ({
            application_id: applicationId,
            tag_id: tagId,
          })),
        )
        .execute();
    }
  }

  async replaceAudiences(
    applicationId: string,
    audience: readonly AudienceRule[],
  ): Promise<void> {
    await this.db
      .deleteFrom("application_audiences")
      .where("application_id", "=", applicationId)
      .execute();
    if (audience.length > 0) {
      await this.db
        .insertInto("application_audiences")
        .values(
          audience.map((rule) => ({
            application_id: applicationId,
            audience_type: rule.audienceType,
            department_id: rule.departmentId,
            employee_id: rule.employeeId,
            include_children: rule.includeChildren,
          })),
        )
        .execute();
    }
  }

  async snapshotVersionContent(
    applicationVersionId: string,
    payload: unknown,
  ): Promise<void> {
    await this.db
      .insertInto("application_version_snapshots")
      .values({ application_version_id: applicationVersionId, payload })
      .execute();
  }

  async getApplicationType(applicationId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom("application_catalog_metadata")
      .select("application_type")
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    return row?.application_type ?? null;
  }

  async listAdmin(
    actor: ActorContext,
    input: ApplicationAdminListInput,
  ): Promise<ApplicationAdminListResult> {
    const canManage =
      actor.permissions?.includes("application.manage") === true ||
      actor.permissions?.includes("*") === true;
    let query = this.db
      .selectFrom("applications as application")
      .innerJoin(
        "employees as owner",
        "owner.employee_id",
        "application.owner_employee_id",
      )
      .innerJoin(
        "departments as department",
        "department.department_id",
        "application.department_id",
      )
      .leftJoin(
        "application_catalog_metadata as metadata",
        "metadata.application_id",
        "application.application_id",
      )
      .select([
        "application.application_id as applicationId",
        "application.name as name",
        "application.summary as summary",
        "application.status as status",
        "application.current_version_id as currentVersionId",
        "application.updated_at as updatedAt",
        "application.owner_employee_id as ownerEmployeeId",
        "application.maintainer_employee_id as maintainerEmployeeId",
        "owner.display_name as ownerName",
        "department.name as departmentName",
        "metadata.category_id as categoryId",
      ]);

    if (!canManage) {
      query = query.where((eb) =>
        eb.or([
          eb("application.owner_employee_id", "=", actor.employeeId),
          eb("application.maintainer_employee_id", "=", actor.employeeId),
        ]),
      );
    }
    if (input.keyword?.trim()) {
      const keyword = `%${input.keyword.trim()}%`;
      query = query.where((eb) =>
        eb.or([
          eb("application.name", "ilike", keyword),
          eb("application.summary", "ilike", keyword),
          eb("application.application_id", "ilike", keyword),
        ]),
      );
    }
    if (input.status !== undefined)
      query = query.where("application.status", "=", input.status);
    if (input.departmentId !== undefined && input.departmentId !== "all")
      query = query.where("application.department_id", "=", input.departmentId);
    if (input.applicationType !== undefined && input.applicationType !== "all")
      query = query.where("metadata.category_id", "=", input.applicationType);
    if (input.mode === "owned")
      query = query.where((eb) =>
        eb.or([
          eb("application.owner_employee_id", "=", actor.employeeId),
          eb("application.maintainer_employee_id", "=", actor.employeeId),
        ]),
      );
    if (input.mode === "review")
      query = query.where("application.status", "=", "in_review");
    const rows = await query
      .orderBy(
        input.sort === "name"
          ? "application.name"
          : input.sort === "status"
            ? "application.status"
            : "application.updated_at",
        "desc",
      )
      .execute();
    const applicationIds = rows.map((row) => row.applicationId);
    const [deliveries, versions, reviewQueues] = await Promise.all([
      applicationIds.length === 0
        ? Promise.resolve(
            [] as Array<{ application_id: string; channel: DeliveryChannel }>,
          )
        : this.db
            .selectFrom("application_deliveries")
            .select(["application_id", "channel"])
            .where("application_id", "in", applicationIds)
            .where("enabled", "=", true)
            .execute(),
      applicationIds.length === 0
        ? Promise.resolve(
            [] as Array<{
              application_id: string;
              application_version_id: string;
              version: string;
            }>,
          )
        : this.db
            .selectFrom("application_versions")
            .select(["application_id", "application_version_id", "version"])
            .where("application_id", "in", applicationIds)
            .orderBy("created_at", "desc")
            .execute(),
      applicationIds.length === 0
        ? Promise.resolve(
            [] as Array<{
              application_id: string;
              status: "available" | "claimed";
              claimed_by_employee_id: string | null;
            }>,
          )
        : this.db
            .selectFrom("application_review_queue")
            .select(["application_id", "status", "claimed_by_employee_id"])
            .where("application_id", "in", applicationIds)
            .execute(),
    ]);
    const versionById = new Map(
      versions.map((version) => [
        version.application_version_id,
        version.version,
      ]),
    );
    const latestVersionByApplication = new Map<
      string,
      { applicationVersionId: string; version: string }
    >();
    for (const version of versions) {
      if (!latestVersionByApplication.has(version.application_id)) {
        latestVersionByApplication.set(version.application_id, {
          applicationVersionId: version.application_version_id,
          version: version.version,
        });
      }
    }
    const channelsByApp = new Map<string, DeliveryChannel[]>();
    for (const delivery of deliveries)
      channelsByApp.set(delivery.application_id, [
        ...(channelsByApp.get(delivery.application_id) ?? []),
        delivery.channel,
      ]);
    const reviewByApp = new Map(
      reviewQueues.map((queue) => [queue.application_id, queue]),
    );
    const items = rows
      .filter(
        (row) =>
          input.channel === undefined ||
          channelsByApp.get(row.applicationId)?.includes(input.channel),
      )
      .map((row) => ({
        applicationId: row.applicationId,
        name: row.name,
        summary: row.summary,
        categoryId: row.categoryId ?? "",
        status: row.status,
        currentVersion:
          row.currentVersionId === null
            ? (latestVersionByApplication.get(row.applicationId)?.version ?? "")
            : (versionById.get(row.currentVersionId) ?? ""),
        currentVersionId:
          row.currentVersionId ??
          latestVersionByApplication.get(row.applicationId)
            ?.applicationVersionId ??
          null,
        ownerName: row.ownerName,
        departmentName: row.departmentName,
        deliveryChannels: channelsByApp.get(row.applicationId) ?? [],
        updatedAt: row.updatedAt.toISOString(),
        isMine:
          row.ownerEmployeeId === actor.employeeId ||
          row.maintainerEmployeeId === actor.employeeId,
        needsMyReview:
          row.status === "in_review" &&
          reviewByApp.get(row.applicationId)?.claimed_by_employee_id !==
            actor.employeeId,
      }));
    const start = (input.page - 1) * input.pageSize;
    return {
      items: items.slice(start, start + input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: items.length,
    };
  }

  async getAdminKpis(actor: ActorContext): Promise<ApplicationAdminKpis> {
    const canManage =
      actor.permissions?.includes("application.manage") === true ||
      actor.permissions?.includes("*") === true;
    let query = this.db
      .selectFrom("applications as application")
      .select([
        "application.application_id as applicationId",
        "application.status as status",
      ]);
    if (!canManage) {
      query = query.where((eb) =>
        eb.or([
          eb("application.owner_employee_id", "=", actor.employeeId),
          eb("application.maintainer_employee_id", "=", actor.employeeId),
        ]),
      );
    }
    const rows = await query.execute();
    const applicationIds = rows.map((row) => row.applicationId);
    const deliveries =
      applicationIds.length === 0
        ? []
        : await this.db
            .selectFrom("application_deliveries")
            .select("application_id")
            .where("enabled", "=", true)
            .where("application_id", "in", applicationIds)
            .execute();
    const deliveredIds = new Set(
      deliveries.map((delivery) => delivery.application_id),
    );
    return {
      deliveryFailed: rows.filter(
        (row) =>
          row.status === "withdrawn" || !deliveredIds.has(row.applicationId),
      ).length,
      pendingReview: rows.filter((row) => row.status === "in_review").length,
      published: rows.filter((row) => row.status === "published").length,
      total: rows.length,
    };
  }

  async createVersion(
    input: Omit<ApplicationVersionRecord, "createdAt">,
  ): Promise<ApplicationVersionRecord> {
    const row = await this.db
      .insertInto("application_versions")
      .values({
        application_version_id: input.applicationVersionId,
        application_id: input.applicationId,
        version: input.version,
        changelog: input.changelog,
        artifact_key: input.artifactKey,
        artifact_sha256: input.artifactSha256,
        artifact_signature: input.artifactSignature,
        scan_status: input.scanStatus,
        created_by_employee_id: input.createdByEmployeeId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapVersion(row);
  }

  async findVersion(
    applicationVersionId: string,
  ): Promise<ApplicationVersionRecord | null> {
    const row = await this.db
      .selectFrom("application_versions")
      .selectAll()
      .where("application_version_id", "=", applicationVersionId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapVersion(row);
  }

  async listVersions(
    applicationId: string,
  ): Promise<readonly ApplicationVersionRecord[]> {
    const rows = await this.db
      .selectFrom("application_versions")
      .selectAll()
      .where("application_id", "=", applicationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.mapVersion(row));
  }

  async createArtifactUpload(
    input: Omit<ArtifactUploadRecord, "uploadId" | "createdAt" | "completedAt">,
  ): Promise<ArtifactUploadRecord> {
    const row = await this.db
      .insertInto("application_artifact_uploads")
      .values({
        application_id: input.applicationId,
        uploaded_by_employee_id: input.uploadedByEmployeeId,
        object_key: input.objectKey,
        staging_object_key: input.stagingObjectKey ?? input.objectKey,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        kind: input.kind,
        sha256: input.sha256,
        signature: input.signature,
        part_count: input.partCount,
        upload_status: input.uploadStatus,
        scan_status: input.scanStatus,
        error_code: input.errorCode,
        verification_attempts: input.verificationAttempts ?? 0,
        verification_started_at: input.verificationStartedAt ?? null,
        updated_at: input.updatedAt ?? new Date(),
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapArtifactUpload(row);
  }

  async findArtifactUpload(
    uploadId: string,
  ): Promise<ArtifactUploadRecord | null> {
    const row = await this.db
      .selectFrom("application_artifact_uploads")
      .selectAll()
      .where("upload_id", "=", uploadId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapArtifactUpload(row);
  }

  async findVerifiedArtifact(input: {
    applicationId: string;
    objectKey: string;
    sha256: string;
    signature: string;
  }): Promise<ArtifactUploadRecord | null> {
    const row = await this.db
      .selectFrom("application_artifact_uploads")
      .selectAll()
      .where("application_id", "=", input.applicationId)
      .where("object_key", "=", input.objectKey)
      .where("sha256", "=", input.sha256)
      .where("signature", "=", input.signature)
      .where("upload_status", "=", "completed")
      .where("scan_status", "=", "passed")
      .where("completed_at", "is not", null)
      .executeTakeFirst();
    return row === undefined ? null : this.mapArtifactUpload(row);
  }

  async updateArtifactUpload(
    uploadId: string,
    input: Partial<
      Pick<
        ArtifactUploadRecord,
        | "sha256"
        | "signature"
        | "sizeBytes"
        | "uploadStatus"
        | "scanStatus"
        | "errorCode"
        | "completedAt"
        | "objectKey"
        | "stagingObjectKey"
        | "verificationStartedAt"
        | "verificationAttempts"
        | "updatedAt"
      >
    >,
  ): Promise<ArtifactUploadRecord | null> {
    const row = await this.db
      .updateTable("application_artifact_uploads")
      .set({
        ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }),
        ...(input.signature === undefined
          ? {}
          : { signature: input.signature }),
        ...(input.sizeBytes === undefined
          ? {}
          : { size_bytes: input.sizeBytes }),
        ...(input.uploadStatus === undefined
          ? {}
          : { upload_status: input.uploadStatus }),
        ...(input.scanStatus === undefined
          ? {}
          : { scan_status: input.scanStatus }),
        ...(input.errorCode === undefined
          ? {}
          : { error_code: input.errorCode }),
        ...(input.completedAt === undefined
          ? {}
          : { completed_at: input.completedAt }),
        ...(input.objectKey === undefined
          ? {}
          : { object_key: input.objectKey }),
        ...(input.stagingObjectKey === undefined
          ? {}
          : { staging_object_key: input.stagingObjectKey }),
        ...(input.verificationStartedAt === undefined
          ? {}
          : { verification_started_at: input.verificationStartedAt }),
        ...(input.verificationAttempts === undefined
          ? {}
          : { verification_attempts: input.verificationAttempts }),
        updated_at: new Date(),
      })
      .where("upload_id", "=", uploadId)
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapArtifactUpload(row);
  }

  async claimArtifactVerification(input: {
    uploadId: string;
    expectedSha256: string;
    requestedSignature?: string | null;
  }): Promise<ArtifactUploadRecord | null> {
    const row = await this.db
      .updateTable("application_artifact_uploads")
      .set({
        upload_status: "verifying",
        verification_started_at: new Date(),
        verification_attempts: (eb) => eb("verification_attempts", "+", 1),
        ...(input.requestedSignature === undefined
          ? {}
          : { signature: input.requestedSignature }),
        updated_at: new Date(),
      })
      .where("upload_id", "=", input.uploadId)
      .where("upload_status", "=", "uploading")
      .where("sha256", "=", input.expectedSha256)
      .where("expires_at", ">", new Date())
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapArtifactUpload(row);
  }

  async finalizeArtifactVerification(input: {
    uploadId: string;
    objectKey: string;
    signature: string;
  }): Promise<ArtifactUploadRecord | null> {
    const row = await this.db
      .updateTable("application_artifact_uploads")
      .set({
        upload_status: "completed",
        scan_status: "passed",
        signature: input.signature,
        object_key: input.objectKey,
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where("upload_id", "=", input.uploadId)
      .where("upload_status", "=", "verifying")
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapArtifactUpload(row);
  }

  async failArtifactVerification(input: {
    uploadId: string;
    errorCode: string;
  }): Promise<ArtifactUploadRecord | null> {
    const row = await this.db
      .updateTable("application_artifact_uploads")
      .set({
        upload_status: "failed",
        scan_status: "failed",
        error_code: input.errorCode,
        updated_at: new Date(),
      })
      .where("upload_id", "=", input.uploadId)
      .where("upload_status", "=", "verifying")
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapArtifactUpload(row);
  }

  async listStaleArtifactVerifications(input: {
    olderThan: Date;
    limit: number;
  }): Promise<readonly ArtifactUploadRecord[]> {
    const rows = await this.db
      .selectFrom("application_artifact_uploads")
      .selectAll()
      .where("upload_status", "=", "verifying")
      .where("verification_started_at", "<", input.olderThan)
      .orderBy("verification_started_at", "asc")
      .limit(input.limit)
      .execute();
    return rows.map((row) => this.mapArtifactUpload(row));
  }

  async resetStaleArtifactVerification(uploadId: string): Promise<boolean> {
    const result = await this.db
      .updateTable("application_artifact_uploads")
      .set({
        upload_status: "uploading",
        scan_status: "pending",
        verification_started_at: null,
        error_code: null,
        updated_at: new Date(),
      })
      .where("upload_id", "=", uploadId)
      .where("upload_status", "=", "verifying")
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async createAsset(
    input: Omit<AssetRecord, "assetId" | "createdAt">,
  ): Promise<AssetRecord> {
    const row = await this.db
      .insertInto("application_assets")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        asset_type: input.assetType,
        name: input.name,
        storage_key: input.storageKey,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        sort_order: input.sortOrder,
        sha256: input.sha256,
        scan_status: input.scanStatus,
        uploaded_by_employee_id: input.uploadedByEmployeeId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapAsset(row);
  }

  async listAssets(applicationId: string): Promise<readonly AssetRecord[]> {
    const rows = await this.db
      .selectFrom("application_assets")
      .selectAll()
      .where("application_id", "=", applicationId)
      .orderBy("sort_order", "asc")
      .execute();
    return rows.map((row) => this.mapAsset(row));
  }

  async findAsset(assetId: string): Promise<AssetRecord | null> {
    const row = await this.db
      .selectFrom("application_assets")
      .selectAll()
      .where("asset_id", "=", assetId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapAsset(row);
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.db
      .deleteFrom("application_assets")
      .where("asset_id", "=", assetId)
      .execute();
  }

  async setApplicationStatus(input: {
    applicationId: string;
    expectedStatus: ApplicationRecord["status"];
    status: ApplicationRecord["status"];
    currentVersionId?: string;
    pendingVersionId?: string | null;
  }): Promise<ApplicationRecord> {
    const row = await this.db
      .updateTable("applications")
      .set({
        status: input.status,
        ...(input.currentVersionId === undefined
          ? {}
          : { current_version_id: input.currentVersionId }),
        ...(input.pendingVersionId === undefined
          ? {}
          : { pending_version_id: input.pendingVersionId }),
        updated_at: new Date(),
      })
      .where("application_id", "=", input.applicationId)
      .where("status", "=", input.expectedStatus)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("APPLICATION_STATE_CONFLICT");
    return this.mapApplication(row);
  }

  async createDelivery(
    input: Omit<DeliveryRecord, "deliveryId">,
  ): Promise<DeliveryRecord> {
    const row = await this.db
      .insertInto("application_deliveries")
      .values({
        application_id: input.applicationId,
        channel: input.channel,
        entry_url: input.entryUrl,
        min_client_version: input.minClientVersion,
        enabled: input.enabled,
      })
      .onConflict((oc) =>
        oc.columns(["application_id", "channel"]).doUpdateSet({
          entry_url: input.entryUrl,
          min_client_version: input.minClientVersion,
          enabled: input.enabled,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapDelivery(row);
  }

  async listDeliveries(
    applicationId: string,
  ): Promise<readonly DeliveryRecord[]> {
    const rows = await this.db
      .selectFrom("application_deliveries")
      .selectAll()
      .where("application_id", "=", applicationId)
      .orderBy("channel")
      .execute();
    return rows.map((row) => this.mapDelivery(row));
  }

  async createReview(
    input: Omit<ReviewRecord, "reviewId" | "createdAt">,
  ): Promise<ReviewRecord> {
    const row = await this.db
      .insertInto("application_reviews")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        reviewer_employee_id: input.reviewerEmployeeId,
        application_owner_employee_id: input.applicationOwnerEmployeeId,
        decision: input.decision,
        comment: input.comment,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReview(row);
  }

  async listReviews(applicationId: string): Promise<readonly ReviewRecord[]> {
    const rows = await this.db
      .selectFrom("application_reviews")
      .selectAll()
      .where("application_id", "=", applicationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.mapReview(row));
  }

  async createReviewQueue(
    input: Omit<ReviewQueueRecord, "reviewQueueId" | "createdAt">,
  ): Promise<ReviewQueueRecord> {
    const row = await this.db
      .insertInto("application_review_queue")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        status: input.status,
        claimed_by_employee_id: input.claimedByEmployeeId,
        claimed_at: input.claimedAt,
        sla_due_at: input.slaDueAt,
        source_status: input.sourceStatus,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReviewQueue(row);
  }

  async findReviewQueueByVersion(
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord | null> {
    const row = await this.db
      .selectFrom("application_review_queue")
      .selectAll()
      .where("application_version_id", "=", applicationVersionId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapReviewQueue(row);
  }

  async claimReviewQueue(
    applicationVersionId: string,
    employeeId: string,
  ): Promise<ReviewQueueRecord> {
    const row = await this.db
      .updateTable("application_review_queue")
      .set({
        status: "claimed",
        claimed_by_employee_id: employeeId,
        claimed_at: new Date(),
      })
      .where("application_version_id", "=", applicationVersionId)
      .where("status", "=", "available")
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReviewQueue(row);
  }

  async releaseReviewQueue(
    applicationVersionId: string,
    employeeId: string,
  ): Promise<ReviewQueueRecord> {
    const row = await this.db
      .updateTable("application_review_queue")
      .set({
        status: "available",
        claimed_by_employee_id: null,
        claimed_at: null,
      })
      .where("application_version_id", "=", applicationVersionId)
      .where("claimed_by_employee_id", "=", employeeId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReviewQueue(row);
  }

  async completeReviewQueue(
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord> {
    const row = await this.db
      .updateTable("application_review_queue")
      .set({ status: "completed" })
      .where("application_version_id", "=", applicationVersionId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReviewQueue(row);
  }

  /** SLA 提醒任务查询：截止前 hours 小时内已领取（status='claimed'）的审核队列。 */
  async listReviewsDueWithin(
    now: Date,
    hours: number,
  ): Promise<
    Array<{
      applicationVersionId: string;
      claimedByEmployeeId: string | null;
      ownerEmployeeId: string;
      name: string;
    }>
  > {
    const horizon = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const rows = await this.db
      .selectFrom("application_review_queue as queue")
      .innerJoin(
        "applications as app",
        "app.application_id",
        "queue.application_id",
      )
      .select([
        "queue.application_version_id as applicationVersionId",
        "queue.claimed_by_employee_id as claimedByEmployeeId",
        "app.owner_employee_id as ownerEmployeeId",
        "app.name",
      ])
      .where("queue.status", "=", "claimed")
      .where("queue.sla_due_at", ">=", now)
      .where("queue.sla_due_at", "<", horizon)
      .execute();
    return rows.map((row) => ({
      applicationVersionId: row.applicationVersionId,
      claimedByEmployeeId: row.claimedByEmployeeId,
      ownerEmployeeId: row.ownerEmployeeId,
      name: row.name,
    }));
  }

  /** SLA 提醒任务查询：已超时且仍未完成的审核队列。 */
  async listExpiredReviews(now: Date): Promise<
    Array<{
      applicationVersionId: string;
      claimedByEmployeeId: string | null;
      ownerEmployeeId: string;
      name: string;
    }>
  > {
    const rows = await this.db
      .selectFrom("application_review_queue as queue")
      .innerJoin(
        "applications as app",
        "app.application_id",
        "queue.application_id",
      )
      .select([
        "queue.application_version_id as applicationVersionId",
        "queue.claimed_by_employee_id as claimedByEmployeeId",
        "app.owner_employee_id as ownerEmployeeId",
        "app.name",
      ])
      .where("queue.status", "in", ["available", "claimed"])
      .where("queue.sla_due_at", "<", now)
      .execute();
    return rows.map((row) => ({
      applicationVersionId: row.applicationVersionId,
      claimedByEmployeeId: row.claimedByEmployeeId,
      ownerEmployeeId: row.ownerEmployeeId,
      name: row.name,
    }));
  }

  async recordAudit(input: {
    applicationId: string;
    applicationVersionId?: string | null;
    actorEmployeeId?: string | null;
    eventType: string;
    details?: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("application_audit_events")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId ?? null,
        actor_employee_id: input.actorEmployeeId ?? null,
        event_type: input.eventType,
        details: input.details ?? {},
      })
      .execute();
  }

  async emitOutbox(input: {
    applicationId: string;
    applicationVersionId?: string | null;
    eventType: string;
    details?: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        event_type: input.eventType,
        aggregate_type: "application",
        aggregate_id: input.applicationId,
        payload: {
          applicationId: input.applicationId,
          applicationVersionId: input.applicationVersionId ?? null,
          ...(input.details === undefined ? {} : { details: input.details }),
        },
        idempotency_key: `${input.eventType}:${input.applicationId}:${input.applicationVersionId ?? "none"}:${randomUUID()}`,
        status: "pending",
        attempts: 0,
        available_at: new Date(),
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        completed_at: null,
      })
      .execute();
  }

  async registerToCatalog(input: {
    applicationId: string;
    name: string;
    summary: string;
    categoryId?: string;
    applicationType?: string;
  }): Promise<void> {
    const categoryId = input.categoryId ?? "productivity";
    const applicationType = input.applicationType ?? "web_app";
    await this.db
      .insertInto("application_audiences")
      .values({
        audience_id: input.applicationId,
        application_id: input.applicationId,
        audience_type: "all",
        department_id: null,
        employee_id: null,
        include_children: false,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
    await this.db
      .insertInto("application_catalog_metadata")
      .values({
        application_id: input.applicationId,
        category_id: categoryId,
        application_type: applicationType,
        search_name: input.name,
        search_summary: input.summary,
        search_pinyin: "",
        search_initials: "",
        recommendation_rank: 0,
        health_status: "unknown",
        deprecated_reason: null,
        replacement_application_id: null,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  async linkDeliveryAsset(input: {
    applicationId: string;
    channel: DeliveryChannel;
    assetId: string;
    sortOrder?: number;
    version?: string | null;
  }): Promise<void> {
    const delivery = await this.db
      .selectFrom("application_deliveries")
      .select("delivery_id")
      .where("application_id", "=", input.applicationId)
      .where("channel", "=", input.channel)
      .executeTakeFirst();
    if (delivery === undefined) {
      throw new Error("DELIVERY_NOT_FOUND");
    }
    await this.db
      .insertInto("application_delivery_assets")
      .values({
        delivery_id: delivery.delivery_id,
        platform: input.channel,
        asset_id: input.assetId,
        version: input.version ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .onConflict((oc) =>
        oc.columns(["delivery_id", "platform", "asset_id"]).doNothing(),
      )
      .execute();
  }

  async updateAsset(
    assetId: string,
    input: Partial<Pick<AssetRecord, "scanStatus" | "sha256" | "sizeBytes">>,
  ): Promise<AssetRecord | null> {
    const row = await this.db
      .updateTable("application_assets")
      .set({
        ...(input.scanStatus === undefined
          ? {}
          : { scan_status: input.scanStatus }),
        ...(input.sha256 === undefined ? {} : { sha256: input.sha256 }),
        ...(input.sizeBytes === undefined
          ? {}
          : { size_bytes: input.sizeBytes }),
        updated_at: new Date(),
      })
      .where("asset_id", "=", assetId)
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapAsset(row);
  }

  private mapApplication(row: Selectable<DatabaseSchema["applications"]>) {
    return {
      applicationId: row.application_id,
      ownerEmployeeId: row.owner_employee_id,
      maintainerEmployeeId: row.maintainer_employee_id,
      departmentId: row.department_id,
      name: row.name,
      summary: row.summary,
      status: row.status,
      currentVersionId: row.current_version_id,
      pendingVersionId: row.pending_version_id,
    } satisfies ApplicationRecord;
  }

  private mapVersion(row: Selectable<DatabaseSchema["application_versions"]>) {
    return {
      applicationVersionId: row.application_version_id,
      applicationId: row.application_id,
      version: row.version,
      changelog: row.changelog,
      artifactKey: row.artifact_key,
      artifactSha256: row.artifact_sha256,
      artifactSignature: row.artifact_signature,
      scanStatus: row.scan_status,
      createdByEmployeeId: row.created_by_employee_id,
      createdAt: row.created_at,
    } satisfies ApplicationVersionRecord;
  }

  private mapDelivery(
    row: Selectable<DatabaseSchema["application_deliveries"]>,
  ) {
    return {
      deliveryId: row.delivery_id,
      applicationId: row.application_id,
      channel: row.channel,
      entryUrl: row.entry_url,
      minClientVersion: row.min_client_version,
      enabled: row.enabled,
    } satisfies DeliveryRecord;
  }

  private mapReview(row: Selectable<DatabaseSchema["application_reviews"]>) {
    return {
      reviewId: row.review_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      reviewerEmployeeId: row.reviewer_employee_id,
      applicationOwnerEmployeeId: row.application_owner_employee_id,
      decision: row.decision,
      comment: row.comment,
      createdAt: row.created_at,
    } satisfies ReviewRecord;
  }

  private mapReviewQueue(
    row: Selectable<DatabaseSchema["application_review_queue"]>,
  ): ReviewQueueRecord {
    return {
      reviewQueueId: row.review_queue_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      status: row.status,
      sourceStatus: row.source_status,
      claimedByEmployeeId: row.claimed_by_employee_id,
      claimedAt: row.claimed_at,
      slaDueAt: row.sla_due_at,
      createdAt: row.created_at,
    };
  }

  private mapArtifactUpload(
    row: Selectable<DatabaseSchema["application_artifact_uploads"]>,
  ): ArtifactUploadRecord {
    return {
      uploadId: row.upload_id,
      applicationId: row.application_id,
      uploadedByEmployeeId: row.uploaded_by_employee_id,
      objectKey: row.object_key,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      kind: row.kind as ArtifactUploadRecord["kind"],
      sha256: row.sha256,
      signature: row.signature,
      partCount: row.part_count,
      uploadStatus: row.upload_status as ArtifactUploadRecord["uploadStatus"],
      scanStatus: row.scan_status,
      errorCode: row.error_code,
      stagingObjectKey: row.staging_object_key,
      verificationStartedAt: row.verification_started_at,
      verificationAttempts: row.verification_attempts,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    };
  }

  private mapAsset(
    row: Selectable<DatabaseSchema["application_assets"]>,
  ): AssetRecord {
    return {
      assetId: row.asset_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      assetType: row.asset_type,
      name: row.name,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      sortOrder: row.sort_order,
      sha256: row.sha256,
      scanStatus: row.scan_status,
      uploadedByEmployeeId: row.uploaded_by_employee_id,
      createdAt: row.created_at,
    };
  }
}
