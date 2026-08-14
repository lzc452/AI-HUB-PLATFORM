import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
} from "@ai-hub/contracts";
import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import type {
  CatalogEntry,
  CatalogRepository,
  CatalogSearchInput,
} from "./catalog.types.js";
import type { DeliveryChannel } from "../application/application.types.js";

type CatalogRow = {
  applicationId: string;
  name: string;
  summary: string;
  departmentId: string;
  categoryId: string;
  currentVersionId: string | null;
  publishedAt: Date;
  recommendationRank: number;
  likeCount: number;
  ratingAverage: number | null;
  healthStatus: "unknown" | "healthy" | "degraded" | "failed";
  deprecatedReason: string | null;
  replacementApplicationId: string | null;
  ownerEmployeeId: string;
  maintainerName: string | null;
  ratingCount: number;
};

export class KyselyCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listVisible(
    input: CatalogSearchInput,
    applicationId?: string,
  ): Promise<readonly CatalogEntry[]> {
    const departmentIds = input.actor.departmentIds;
    let query = this.db
      .selectFrom("application_catalog_metadata as metadata")
      .innerJoin(
        "applications as application",
        "application.application_id",
        "metadata.application_id",
      )
      .leftJoin(
        "employees as maintainer",
        "maintainer.employee_id",
        "application.maintainer_employee_id",
      )
      .select([
        "application.application_id as applicationId",
        "application.name as name",
        "application.summary as summary",
        "application.department_id as departmentId",
        "application.owner_employee_id as ownerEmployeeId",
        "maintainer.display_name as maintainerName",
        "metadata.category_id as categoryId",
        "application.current_version_id as currentVersionId",
        "application.updated_at as publishedAt",
        "metadata.recommendation_rank as recommendationRank",
        "metadata.health_status as healthStatus",
        "metadata.deprecated_reason as deprecatedReason",
        "metadata.replacement_application_id as replacementApplicationId",
        sql<number>`(
          select count(*)::int
          from application_likes like_row
          where like_row.application_id = application.application_id
        )`.as("likeCount"),
        sql<number | null>`(
          select avg(rating.stars)::float
          from application_ratings rating
          where rating.application_id = application.application_id
        )`.as("ratingAverage"),
        sql<number>`(
          select count(*)::int
          from application_ratings rating_count
          where rating_count.application_id = application.application_id
        )`.as("ratingCount"),
      ])
      .where("application.status", "=", "published")
      .where("application.current_version_id", "is not", null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("application_audiences as audience")
            .select("audience.audience_id")
            .whereRef(
              "audience.application_id",
              "=",
              "application.application_id",
            )
            .where((audienceEb) =>
              audienceEb.or([
                audienceEb("audience.audience_type", "=", "all"),
                audienceEb("audience.employee_id", "=", input.actor.employeeId),
                audienceEb("audience.department_id", "in", departmentIds),
              ]),
            ),
        ),
      );

    if (applicationId !== undefined) {
      query = query.where("application.application_id", "=", applicationId);
    }

    const queryText = input.query?.trim();
    if (queryText !== undefined && queryText.length > 0) {
      const pattern = `%${queryText}%`;
      query = query.where((eb) =>
        eb.or([
          eb("metadata.search_name", "ilike", pattern),
          eb("metadata.search_summary", "ilike", pattern),
          eb("metadata.search_pinyin", "ilike", pattern),
          eb("metadata.search_initials", "ilike", pattern),
        ]),
      );
    }
    if (input.categoryId !== undefined) {
      query = query.where("metadata.category_id", "=", input.categoryId);
    }
    if (input.applicationType !== undefined) {
      query = query.where(
        "metadata.application_type",
        "=",
        input.applicationType,
      );
    }
    for (const tagId of input.tagIds ?? []) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("application_tag_links as tag_link")
            .select("tag_link.tag_id")
            .whereRef(
              "tag_link.application_id",
              "=",
              "application.application_id",
            )
            .where("tag_link.tag_id", "=", tagId),
        ),
      );
    }

    if (input.sort === "recommended") {
      query = query.orderBy("metadata.recommendation_rank", "desc");
    } else if (input.sort === "popular") {
      query = query.orderBy("likeCount", "desc");
    } else {
      query = query.orderBy("application.updated_at", "desc");
    }

    const rows = await query.execute();
    return Promise.all(
      rows.map((row) =>
        this.mapEntry(row as unknown as CatalogRow, input.actor),
      ),
    );
  }

  async findVisible(
    actor: ActorContext,
    applicationId: string,
  ): Promise<CatalogEntry | null> {
    const rows = await this.listVisible(
      {
        actor,
        sort: "recommended",
        page: 1,
        pageSize: 1,
      },
      applicationId,
    );
    return rows[0] ?? null;
  }

  private async mapEntry(
    row: CatalogRow,
    actor: ActorContext,
  ): Promise<CatalogEntry> {
    const [tags, labels, deliveries, attachments] = await Promise.all([
      this.db
        .selectFrom("application_tag_links as tag_link")
        .select("tag_link.tag_id")
        .where("tag_link.application_id", "=", row.applicationId)
        .orderBy("tag_link.tag_id")
        .execute(),
      this.db
        .selectFrom("application_catalog_labels")
        .select("label")
        .where("application_id", "=", row.applicationId)
        .orderBy("label")
        .execute(),
      this.db
        .selectFrom("application_deliveries")
        .select("channel")
        .where("application_id", "=", row.applicationId)
        .where("enabled", "=", true)
        .orderBy("channel")
        .execute(),
      this.db
        .selectFrom("application_assets")
        .select(["name", "mime_type", "size_bytes"])
        .where("application_id", "=", row.applicationId)
        .where("asset_type", "=", "attachment")
        .where("scan_status", "=", "passed")
        .orderBy("sort_order")
        .execute(),
    ]);
    return {
      applicationId: row.applicationId,
      name: row.name,
      summary: row.summary,
      departmentId: row.departmentId,
      categoryId: row.categoryId,
      tagIds: tags.map((tag) => tag.tag_id),
      trustLabels: labels.map(
        (label) => label.label as CatalogEntry["trustLabels"][number],
      ),
      currentVersionId: row.currentVersionId ?? "",
      publishedAt: row.publishedAt,
      deliveryChannels: deliveries.map((delivery) => delivery.channel),
      likeCount: row.likeCount,
      ratingAverage: row.ratingAverage,
      ratingCount: row.ratingCount,
      maintainers: row.maintainerName === null ? [] : [row.maintainerName],
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        type: attachment.mime_type.includes("pdf")
          ? "pdf"
          : attachment.mime_type.includes("word")
            ? "docx"
            : attachment.name.toLowerCase().endsWith(".doc")
              ? "doc"
              : "other",
        size: formatBytes(attachment.size_bytes),
      })),
      capabilities: {
        canResolveDelivery: deliveries.length > 0,
        canLike: hasPermission(actor, PERMISSIONS.INTERACTION_INTERACT),
        canRate: hasPermission(actor, PERMISSIONS.INTERACTION_INTERACT),
        canComment: hasPermission(actor, PERMISSIONS.INTERACTION_INTERACT),
        canSubmitFeedback: hasPermission(
          actor,
          PERMISSIONS.INTERACTION_INTERACT,
        ),
        canModerateComments: hasPermission(
          actor,
          PERMISSIONS.INTERACTION_MODERATE,
        ),
        canEditRisk:
          row.ownerEmployeeId === actor.employeeId ||
          hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE),
      },
      healthStatus: row.healthStatus,
      deprecatedReason: row.deprecatedReason,
      replacementApplicationId: row.replacementApplicationId,
    };
  }

  async recordDeliveryAction(input: {
    applicationId: string;
    applicationVersionId: string;
    actorEmployeeId: string;
    actionType: "web_redirect" | "package_download" | "qr_display";
    channel?: string | null;
    idempotencyKey?: string | null;
    status?: "initiated" | "served" | "failed";
  }): Promise<void> {
    await this.db
      .insertInto("catalog_delivery_actions")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        actor_employee_id: input.actorEmployeeId,
        action_type: input.actionType,
        channel: input.channel ?? null,
        idempotency_key: input.idempotencyKey ?? null,
        status: input.status ?? "initiated",
      })
      .execute();
  }

  async findDelivery(
    applicationId: string,
    channel: DeliveryChannel,
  ): Promise<{ entryUrl: string; enabled: boolean } | null> {
    const row = await this.db
      .selectFrom("application_deliveries")
      .select(["entry_url", "enabled"])
      .where("application_id", "=", applicationId)
      .where("channel", "=", channel)
      .executeTakeFirst();
    return row === undefined
      ? null
      : { entryUrl: row.entry_url, enabled: row.enabled };
  }

  async findDeliveryAssetStorageKey(
    applicationId: string,
    channel: DeliveryChannel,
  ): Promise<string | null> {
    const row = await this.db
      .selectFrom("application_delivery_assets")
      .innerJoin(
        "application_assets",
        "application_assets.asset_id",
        "application_delivery_assets.asset_id",
      )
      .innerJoin(
        "application_deliveries",
        "application_deliveries.delivery_id",
        "application_delivery_assets.delivery_id",
      )
      .select("application_assets.storage_key")
      .where("application_deliveries.application_id", "=", applicationId)
      .where("application_deliveries.channel", "=", channel)
      .where("application_assets.scan_status", "=", "passed")
      .orderBy("application_delivery_assets.sort_order", "asc")
      .limit(1)
      .executeTakeFirst();
    return row?.storage_key ?? null;
  }

  async getRiskDescription(applicationId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom("application_catalog_metadata")
      .select("risk_description")
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    return row?.risk_description ?? null;
  }

  async upsertRiskDescription(
    applicationId: string,
    description: string,
  ): Promise<void> {
    await this.db
      .updateTable("application_catalog_metadata")
      .set({ risk_description: description })
      .where("application_id", "=", applicationId)
      .execute();
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
