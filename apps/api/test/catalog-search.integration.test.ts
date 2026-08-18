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

const actor = {
  employeeId: "E100",
  roleCodes: [],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-100",
} as const;

async function seedApplication(
  db: Kysely<DatabaseSchema>,
  app: {
    applicationId: string;
    versionId: string;
    name: string;
    summary: string;
    searchName: string;
    searchSummary: string;
    searchPinyin: string;
    searchInitials: string;
  },
): Promise<void> {
  await db
    .insertInto("applications")
    .values({
      application_id: app.applicationId,
      owner_employee_id: "E100",
      maintainer_employee_id: "E100",
      department_id: "dept-rnd",
      name: app.name,
      summary: app.summary,
      status: "published",
    })
    .execute();
  // 版本先写，再回填 current_version_id，避免循环外键（同 demo-business-seed）。
  await db
    .insertInto("application_versions")
    .values({
      application_version_id: app.versionId,
      application_id: app.applicationId,
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
    .set({ current_version_id: app.versionId })
    .where("application_id", "=", app.applicationId)
    .execute();
  await db
    .insertInto("application_audiences")
    .values({
      application_id: app.applicationId,
      audience_type: "all",
      department_id: null,
      employee_id: null,
      include_children: false,
    })
    .execute();
  await db
    .insertInto("application_catalog_metadata")
    .values({
      application_id: app.applicationId,
      category_id: "productivity",
      application_type: "web_app",
      search_name: app.searchName,
      search_summary: app.searchSummary,
      search_pinyin: app.searchPinyin,
      search_initials: app.searchInitials,
      recommendation_rank: 0,
      health_status: "healthy",
      deprecated_reason: null,
      replacement_application_id: null,
    })
    .execute();
}

describe("catalog search ranking (pg_trgm)", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await resetDatabase(db);
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
      })
      .execute();
    await db
      .insertInto("employees")
      .values({
        employee_id: "E100",
        display_name: "测试用户",
        status: "active",
        primary_department_id: "dept-rnd",
        password_hash: null,
        password_reset_required: false,
      })
      .execute();
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("ranks exact name matches above prefix matches above fuzzy summary matches", async () => {
    await seedApplication(db, {
      applicationId: "00000000-0000-0000-0000-0000000000c1",
      versionId: "00000000-0000-0000-0000-0000000000c2",
      name: "报销助手",
      summary: "报销助手",
      searchName: "报销助手",
      searchSummary: "报销助手",
      searchPinyin: "bxzs",
      searchInitials: "bxzs",
    });
    await seedApplication(db, {
      applicationId: "00000000-0000-0000-0000-0000000000b1",
      versionId: "00000000-0000-0000-0000-0000000000b2",
      name: "报销助手Pro",
      summary: "报销助手Pro",
      searchName: "报销助手Pro",
      searchSummary: "报销助手Pro",
      searchPinyin: "bxzspro",
      searchInitials: "bxzsp",
    });
    // 名称不包含 "报销助手"，仅 search_summary 命中 —— 必须排在最后。
    await seedApplication(db, {
      applicationId: "00000000-0000-0000-0000-0000000000a1",
      versionId: "00000000-0000-0000-0000-0000000000a2",
      name: "智能报销平台",
      summary: "智能报销平台",
      searchName: "智能报销平台",
      searchSummary: "面向报销助手的智能报销平台",
      searchPinyin: "znbxpt",
      searchInitials: "znbxpt",
    });

    const repository = new KyselyCatalogRepository(db);
    const result = await repository.listVisiblePage({
      actor,
      query: "报销助手",
      sort: "latest",
      page: 1,
      pageSize: 10,
    });
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.name)).toEqual([
      "报销助手",
      "报销助手Pro",
      "智能报销平台",
    ]);
  });
});
