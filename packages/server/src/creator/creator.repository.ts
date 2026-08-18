import type { ApplicationStatus } from "@ai-hub/contracts";
import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import type {
  CreatorApplicationRecord,
  CreatorRepository,
} from "./creator.types.js";

type CreatorApplicationRow = {
  applicationId: string;
  name: string;
  status: ApplicationStatus;
  updatedAt: Date;
  categoryId: string | null;
  likeCount: number;
  ratingAverage: number | null;
};

export class KyselyCreatorRepository implements CreatorRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async findTeam(applicationId: string) {
    const row = await this.db
      .selectFrom("applications")
      .select(["owner_employee_id", "maintainer_employee_id"])
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          ownerEmployeeId: row.owner_employee_id,
          maintainerEmployeeId: row.maintainer_employee_id,
        };
  }

  async getVersionDiff(applicationId: string) {
    const rows = await this.db
      .selectFrom("application_versions")
      .select(["version", "changelog"])
      .where("application_id", "=", applicationId)
      .orderBy("created_at", "desc")
      .limit(2)
      .execute();
    const latest = rows[0];
    const previous = rows[1] ?? latest;
    // 草稿等尚无版本的应用返回空差异，不抛错。
    if (latest === undefined) {
      return {
        fromVersion: "",
        toVersion: "",
        changedFields: [],
      };
    }
    return {
      fromVersion: previous?.version ?? latest.version,
      toVersion: latest.version,
      changedFields:
        previous?.changelog === latest.changelog ? [] : ["changelog"],
    };
  }

  async getValidationReport(applicationId: string) {
    const row = await this.db
      .selectFrom("application_versions")
      .select("scan_status")
      .where("application_id", "=", applicationId)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    const passed = row?.scan_status === "passed";
    return {
      status: passed ? ("passed" as const) : ("failed" as const),
      checks: [
        {
          name: "artifact_scan",
          status: passed ? ("passed" as const) : ("failed" as const),
        },
      ],
    };
  }

  async getAggregateMetrics(applicationId: string) {
    const [actions, likes, ratings] = await Promise.all([
      this.db
        .selectFrom("catalog_delivery_actions")
        .select(["action_type", sql<number>`count(*)::int`.as("count")])
        .where("application_id", "=", applicationId)
        .groupBy("action_type")
        .execute(),
      this.db
        .selectFrom("application_likes")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("application_id", "=", applicationId)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom("application_ratings")
        .select([
          sql<number | null>`avg(stars)::float`.as("average"),
          sql<number>`count(*)::int`.as("count"),
        ])
        .where("application_id", "=", applicationId)
        .executeTakeFirstOrThrow(),
    ]);
    const count = (actionType: string) =>
      actions.find((action) => action.action_type === actionType)?.count ?? 0;
    return {
      redirectCount: count("web_redirect"),
      downloadCount: count("package_download"),
      qrDisplayCount: count("qr_display"),
      likeCount: likes.count,
      ratingAverage: ratings.average,
      reviewCount: ratings.count,
    };
  }

  async listByEmployee(
    employeeId: string,
  ): Promise<readonly CreatorApplicationRecord[]> {
    const rows = await this.db
      .selectFrom("applications as application")
      .leftJoin(
        "application_catalog_metadata as metadata",
        "metadata.application_id",
        "application.application_id",
      )
      .select([
        "application.application_id as applicationId",
        "application.name as name",
        "application.status as status",
        "application.updated_at as updatedAt",
        "metadata.category_id as categoryId",
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
      ])
      .where((eb) =>
        eb.or([
          eb("application.owner_employee_id", "=", employeeId),
          eb("application.maintainer_employee_id", "=", employeeId),
        ]),
      )
      .orderBy("application.updated_at", "desc")
      .execute();
    const applicationIds = rows.map((row) => row.applicationId);
    // 一次批量查询全部标签关联，避免逐行 N+1 查询。
    const tagRows =
      applicationIds.length > 0
        ? await this.db
            .selectFrom("application_tag_links")
            .select(["application_id", "tag_id"])
            .where("application_id", "in", applicationIds)
            .orderBy("application_id")
            .orderBy("tag_id")
            .execute()
        : [];
    const tagsByApplication = new Map<string, string[]>();
    for (const tagRow of tagRows) {
      const tagIds = tagsByApplication.get(tagRow.application_id) ?? [];
      tagIds.push(tagRow.tag_id);
      tagsByApplication.set(tagRow.application_id, tagIds);
    }
    return rows.map((row) =>
      this.mapApplicationRecord(
        row,
        tagsByApplication.get(row.applicationId) ?? [],
      ),
    );
  }

  private mapApplicationRecord(
    row: CreatorApplicationRow,
    tagIds: readonly string[],
  ): CreatorApplicationRecord {
    return {
      applicationId: row.applicationId,
      name: row.name,
      status: row.status,
      categoryId: row.categoryId ?? "",
      tagIds,
      publishedAt:
        row.status === "published" ? row.updatedAt.toISOString() : null,
      ratingAverage: row.ratingAverage,
      likeCount: row.likeCount,
    };
  }
}
