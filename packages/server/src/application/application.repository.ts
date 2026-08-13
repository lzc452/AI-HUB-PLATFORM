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
import type { ActorContext } from "@ai-hub/contracts";

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
      rows.some((row) => row.currentVersionId !== null)
        ? this.db
            .selectFrom("application_versions")
            .select(["application_version_id", "version"])
            .where(
              "application_version_id",
              "in",
              rows
                .map((row) => row.currentVersionId)
                .filter((id): id is string => id !== null),
            )
            .execute()
        : Promise.resolve(
            [] as Array<{ application_version_id: string; version: string }>,
          ),
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
            ? ""
            : (versionById.get(row.currentVersionId) ?? ""),
        currentVersionId: row.currentVersionId,
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
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        sha256: input.sha256,
        signature: input.signature,
        part_count: input.partCount,
        upload_status: input.uploadStatus,
        scan_status: input.scanStatus,
        error_code: input.errorCode,
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
      })
      .where("upload_id", "=", uploadId)
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapArtifactUpload(row);
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

  async setApplicationStatus(
    applicationId: string,
    status: ApplicationRecord["status"],
    currentVersionId?: string,
  ): Promise<ApplicationRecord> {
    const row = await this.db
      .updateTable("applications")
      .set({
        status,
        ...(currentVersionId === undefined
          ? {}
          : { current_version_id: currentVersionId }),
        updated_at: new Date(),
      })
      .where("application_id", "=", applicationId)
      .returningAll()
      .executeTakeFirstOrThrow();
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
      sha256: row.sha256,
      signature: row.signature,
      partCount: row.part_count,
      uploadStatus: row.upload_status as ArtifactUploadRecord["uploadStatus"],
      scanStatus: row.scan_status,
      errorCode: row.error_code,
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
