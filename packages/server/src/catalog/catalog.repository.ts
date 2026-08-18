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
  maintainerEmployeeId: string;
  maintainerName: string | null;
  ratingCount: number;
};

export class KyselyCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listVisible(
    input: CatalogSearchInput,
  ): Promise<readonly CatalogEntry[]> {
    return (await this.listVisiblePage(input)).items;
  }

  async listVisiblePage(
    input: CatalogSearchInput,
    applicationId?: string,
  ): Promise<import("./catalog.types.js").CatalogListResult> {
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
        "application.maintainer_employee_id as maintainerEmployeeId",
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
      const prefix = `${queryText}%`;
      const fuzzy = `%${queryText}%`;
      // `%` 是 pg_trgm 相似度运算符（Kysely 无此比较器，用 raw SQL 表达式）。
      const trgmSimilar = sql<boolean>`metadata.search_name % ${queryText}`;
      // 规格 §10.2：精确匹配、名称前缀、标签分类、简介模糊依次排序。
      // WHERE 保留 ILIKE 中缀兜底（gin_trgm_ops 索引可加速），ORDER BY
      // CASE 表达式给出 exact → 前缀 → trgm → 简介模糊的排序优先级。
      query = query
        .where((eb) =>
          eb.or([
            eb("metadata.search_name", "=", queryText),
            eb("metadata.search_name", "ilike", fuzzy),
            eb("metadata.search_pinyin", "ilike", fuzzy),
            eb("metadata.search_initials", "ilike", prefix),
            eb("metadata.search_summary", "ilike", fuzzy),
            trgmSimilar,
          ]),
        )
        .orderBy((eb) =>
          eb
            .case()
            .when("metadata.search_name", "=", queryText)
            .then(0)
            .when("metadata.search_name", "ilike", prefix)
            .then(1)
            .when("metadata.search_pinyin", "ilike", prefix)
            .then(2)
            .when("metadata.search_initials", "ilike", prefix)
            .then(3)
            .when(trgmSimilar)
            .then(4)
            .when("metadata.search_summary", "ilike", fuzzy)
            .then(5)
            .else(6)
            .end(),
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
    // 主排序并列时以应用 ID 收尾，保证分页跨页稳定、不重复、不遗漏。
    query = query.orderBy("application.application_id", "asc");

    const countRow = await this.db
      .selectFrom(query.as("visible_catalog"))
      .select(sql<number>`count(*)::int`.as("count"))
      .executeTakeFirst();
    const total = Number(countRow?.count ?? 0);
    const rows = await query
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .execute();
    const entries = await this.mapEntries(
      rows as unknown as CatalogRow[],
      input.actor,
    );
    return {
      items: entries,
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async findVisible(
    actor: ActorContext,
    applicationId: string,
  ): Promise<CatalogEntry | null> {
    const result = await this.listVisiblePage(
      {
        actor,
        sort: "recommended",
        page: 1,
        pageSize: 1,
      },
      applicationId,
    );
    return result.items[0] ?? null;
  }

  async findApplicationOwner(applicationId: string): Promise<{
    ownerEmployeeId: string;
    maintainerEmployeeId: string | null;
  } | null> {
    const row = await this.db
      .selectFrom("applications")
      .select([
        "owner_employee_id as ownerEmployeeId",
        "maintainer_employee_id as maintainerEmployeeId",
      ])
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      ownerEmployeeId: row.ownerEmployeeId,
      maintainerEmployeeId: row.maintainerEmployeeId ?? null,
    };
  }

  private async mapEntries(
    rows: readonly CatalogRow[],
    actor: ActorContext,
  ): Promise<readonly CatalogEntry[]> {
    if (rows.length === 0) return [];
    const applicationIds = rows.map((row) => row.applicationId);
    const [tags, labels, deliveries, attachments] = await Promise.all([
      this.db
        .selectFrom("application_tag_links as tag_link")
        .select("tag_link.tag_id")
        .select("tag_link.application_id")
        .where("tag_link.application_id", "in", applicationIds)
        .orderBy("tag_link.tag_id")
        .execute(),
      this.db
        .selectFrom("application_catalog_labels")
        .select(["application_id", "label"])
        .where("application_id", "in", applicationIds)
        .orderBy("label")
        .execute(),
      this.db
        .selectFrom("application_deliveries")
        .select(["application_id", "channel"])
        .where("application_id", "in", applicationIds)
        .where("enabled", "=", true)
        .orderBy("channel")
        .execute(),
      this.db
        .selectFrom("application_assets")
        .select(["application_id", "name", "mime_type", "size_bytes"])
        .where("application_id", "in", applicationIds)
        .where("asset_type", "=", "attachment")
        .where("scan_status", "=", "passed")
        .orderBy("sort_order")
        .execute(),
    ]);
    const tagsByApp = groupBy(tags, (item) => item.application_id);
    const labelsByApp = groupBy(labels, (item) => item.application_id);
    const deliveriesByApp = groupBy(deliveries, (item) => item.application_id);
    const attachmentsByApp = groupBy(
      attachments,
      (item) => item.application_id,
    );
    return rows.map((row) => {
      const appTags = tagsByApp.get(row.applicationId) ?? [];
      const appLabels = labelsByApp.get(row.applicationId) ?? [];
      const appDeliveries = deliveriesByApp.get(row.applicationId) ?? [];
      const appAttachments = attachmentsByApp.get(row.applicationId) ?? [];
      return {
        applicationId: row.applicationId,
        name: row.name,
        summary: row.summary,
        departmentId: row.departmentId,
        categoryId: row.categoryId,
        tagIds: appTags.map((tag) => tag.tag_id),
        trustLabels: appLabels.map(
          (label) => label.label as CatalogEntry["trustLabels"][number],
        ),
        currentVersionId: row.currentVersionId ?? "",
        publishedAt: row.publishedAt,
        deliveryChannels: appDeliveries.map((delivery) => delivery.channel),
        likeCount: row.likeCount,
        ratingAverage: row.ratingAverage,
        ratingCount: row.ratingCount,
        maintainers: row.maintainerName === null ? [] : [row.maintainerName],
        attachments: appAttachments.map((attachment) => ({
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
          canResolveDelivery: appDeliveries.length > 0,
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
          canReplyOfficial:
            row.ownerEmployeeId === actor.employeeId ||
            row.maintainerEmployeeId === actor.employeeId,
        },
        healthStatus: row.healthStatus,
        deprecatedReason: row.deprecatedReason,
        replacementApplicationId: row.replacementApplicationId,
      } satisfies CatalogEntry;
    });
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

  async listCategories() {
    const rows = await this.db
      .selectFrom("catalog_categories")
      .select(["category_id", "name"])
      .where("enabled", "=", true)
      .orderBy("sort_order", "asc")
      .execute();
    return rows.map((row) => ({
      categoryId: row.category_id,
      name: row.name,
    }));
  }

  async listTags() {
    const rows = await this.db
      .selectFrom("catalog_tags")
      .select(["tag_id", "name"])
      .where("enabled", "=", true)
      .execute();
    return rows.map((row) => ({ tagId: row.tag_id, name: row.name }));
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
}
