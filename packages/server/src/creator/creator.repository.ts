import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import type { CreatorRepository } from "./creator.types.js";

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
    if (latest === undefined) throw new Error("APPLICATION_VERSION_NOT_FOUND");
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
}
