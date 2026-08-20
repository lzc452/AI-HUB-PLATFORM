import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import {
  createDatabase,
  runMigrations,
  type DatabaseSchema,
} from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { KyselyCatalogRepository } from "@ai-hub/server";
import { resetDatabase } from "./reset-database.js";

const rndActor = {
  employeeId: "E100",
  roleCodes: ["employee"],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-100",
} as const;

const financeActor = {
  employeeId: "E200",
  roleCodes: ["employee"],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-200",
} as const;

const APPLICATION_ID = "00000000-0000-0000-0000-0000000000f1";
const VERSION_ID = "00000000-0000-0000-0000-0000000000f2";

async function seedBase(db: Kysely<DatabaseSchema>): Promise<void> {
  await db
    .insertInto("departments")
    .values({
      department_id: "dept-rnd",
      name: "研发部",
      parent_department_id: null,
      source: "local",
      status: "active",
      manager_employee_id: null,
      external_id: null,
      last_synced_at: null,
    })
    .execute();
  await db
    .insertInto("catalog_categories")
    .values({
      category_id: "productivity",
      name: "效率工具",
      sort_order: 1,
      enabled: true,
      is_hot: false,
    })
    .execute();
  for (const employeeId of ["E100", "E200"]) {
    await db
      .insertInto("employees")
      .values({
        employee_id: employeeId,
        display_name: `测试用户 ${employeeId}`,
        status: "active",
        primary_department_id: "dept-rnd",
        password_hash: null,
        password_reset_required: false,
      })
      .execute();
  }
  await db
    .insertInto("applications")
    .values({
      application_id: APPLICATION_ID,
      owner_employee_id: "E100",
      maintainer_employee_id: "E100",
      department_id: "dept-rnd",
      name: "平台助手",
      summary: "平台流程自动化",
      status: "published",
      updated_at: new Date("2026-01-01T00:00:00Z"),
    })
    .execute();
  await db
    .insertInto("application_versions")
    .values({
      application_version_id: VERSION_ID,
      application_id: APPLICATION_ID,
      version: "1.0.0",
      changelog: "",
      artifact_key: null,
      artifact_sha256: null,
      artifact_signature: null,
      scan_status: "passed",
      created_by_employee_id: "E100",
    })
    .execute();
  await db
    .updateTable("applications")
    .set({ current_version_id: VERSION_ID })
    .where("application_id", "=", APPLICATION_ID)
    .execute();
  await db
    .insertInto("application_audiences")
    .values({
      application_id: APPLICATION_ID,
      audience_type: "all",
      department_id: null,
      employee_id: null,
      include_children: false,
    })
    .execute();
  await db
    .insertInto("application_catalog_metadata")
    .values({
      application_id: APPLICATION_ID,
      category_id: "productivity",
      application_type: "web_app",
      search_name: "平台助手",
      search_summary: "平台流程自动化",
      search_pinyin: "ptzs",
      search_initials: "ptzs",
      recommendation_rank: 0,
      health_status: "healthy",
      deprecated_reason: null,
      replacement_application_id: null,
    })
    .execute();
}

function listInput(actor: typeof rndActor | typeof financeActor) {
  return { actor, sort: "latest" as const, page: 1, pageSize: 10 };
}

describe("catalog myRating / likedByMe (actor-scoped)", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let repository: KyselyCatalogRepository;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await resetDatabase(db);
    await seedBase(db);
    repository = new KyselyCatalogRepository(db);
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("actor 已评分且已点赞时返回其评分与点赞状态（列表与详情一致）", async () => {
    await db
      .insertInto("application_likes")
      .values({ application_id: APPLICATION_ID, employee_id: "E100" })
      .execute();
    await db
      .insertInto("application_ratings")
      .values({
        application_id: APPLICATION_ID,
        application_version_id: VERSION_ID,
        employee_id: "E100",
        stars: 4,
        body: null,
        display_anonymously: false,
      })
      .execute();

    const list = await repository.listVisiblePage(listInput(rndActor));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      applicationId: APPLICATION_ID,
      myRating: 4,
      likedByMe: true,
    });

    const detail = await repository.findVisible(rndActor, APPLICATION_ID);
    expect(detail).toMatchObject({
      applicationId: APPLICATION_ID,
      myRating: 4,
      likedByMe: true,
    });
  });

  it("actor 未评分未点赞时返回 null/false", async () => {
    const list = await repository.listVisiblePage(listInput(financeActor));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      applicationId: APPLICATION_ID,
      myRating: null,
      likedByMe: false,
    });

    const detail = await repository.findVisible(financeActor, APPLICATION_ID);
    expect(detail).toMatchObject({
      applicationId: APPLICATION_ID,
      myRating: null,
      likedByMe: false,
    });
  });

  it("不同 actor 的评分与点赞互不影响", async () => {
    await db
      .insertInto("application_likes")
      .values({ application_id: APPLICATION_ID, employee_id: "E200" })
      .execute();
    await db
      .insertInto("application_ratings")
      .values({
        application_id: APPLICATION_ID,
        application_version_id: VERSION_ID,
        employee_id: "E200",
        stars: 2,
        body: null,
        display_anonymously: false,
      })
      .execute();

    // E200 现在有自己的评分/点赞，不再属于"未评分"状态。
    const financeList = await repository.listVisiblePage(
      listInput(financeActor),
    );
    expect(financeList.items[0]).toMatchObject({
      myRating: 2,
      likedByMe: true,
    });

    // E100 的视角不受 E200 的评分/点赞影响。
    const rndList = await repository.listVisiblePage(listInput(rndActor));
    expect(rndList.items[0]).toMatchObject({
      myRating: 4,
      likedByMe: true,
    });
  });
});
