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
    categoryId?: string;
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
      // 固定 updated_at：同层排序并列时由 application_id 决定，跨用例可复现。
      updated_at: new Date("2026-01-01T00:00:00Z"),
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
      category_id: app.categoryId ?? "productivity",
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

  it("ranks tag and category matches above fuzzy summary matches", async () => {
    await db
      .insertInto("catalog_categories")
      .values({
        category_id: "expense-assistant",
        name: "报销助手系统",
        sort_order: 2,
        enabled: true,
      })
      .execute();
    await db
      .insertInto("catalog_tags")
      .values({
        tag_id: "tag-expense",
        name: "报销助手",
        enabled: true,
      })
      .execute();
    // D：名称/拼音/首字母/简介均不命中查询词，仅标签名命中 —— 应排在仅
    // summary 命中的应用 C 之前（标签/分类层级 > 简介模糊层级）。
    await seedApplication(db, {
      applicationId: "00000000-0000-0000-0000-0000000000d1",
      versionId: "00000000-0000-0000-0000-0000000000d2",
      name: "预算管控台",
      summary: "预算与费用管控",
      searchName: "预算管控台",
      searchSummary: "预算与费用管控",
      searchPinyin: "ysgkt",
      searchInitials: "ysgkt",
    });
    await db
      .insertInto("application_tag_links")
      .values({
        application_id: "00000000-0000-0000-0000-0000000000d1",
        tag_id: "tag-expense",
      })
      .execute();
    // E：仅分类名命中查询词，同样应排在 summary 模糊命中之前。
    await seedApplication(db, {
      applicationId: "00000000-0000-0000-0000-0000000000e1",
      versionId: "00000000-0000-0000-0000-0000000000e2",
      name: "财务数据中心",
      summary: "财务数据管理",
      searchName: "财务数据中心",
      searchSummary: "财务数据管理",
      searchPinyin: "cwsjzx",
      searchInitials: "cwsjzx",
      categoryId: "expense-assistant",
    });

    const repository = new KyselyCatalogRepository(db);
    const result = await repository.listVisiblePage({
      actor,
      query: "报销助手",
      sort: "latest",
      page: 1,
      pageSize: 10,
    });
    expect(result.total).toBe(5);
    // D 与 E 同层（标签/分类，rank 2），并列时按 updated_at（固定值）→
    // application_id 升序，d1 < e1。
    expect(result.items.map((item) => item.name)).toEqual([
      "报销助手",
      "报销助手Pro",
      "预算管控台",
      "财务数据中心",
      "智能报销平台",
    ]);
  });

  it("sort=rating 按平均评分降序、无评分排最后且跨页排序稳定", async () => {
    await db
      .insertInto("catalog_categories")
      .values({
        category_id: "ratings-cat",
        name: "评分排序测试",
        sort_order: 3,
        enabled: true,
      })
      .execute();
    // g1 需要第二条评分（E101）得到 4.5 均值，先建员工。
    await db
      .insertInto("employees")
      .values({
        employee_id: "E101",
        display_name: "评分用户",
        status: "active",
        primary_department_id: "dept-rnd",
        password_hash: null,
        password_reset_required: false,
      })
      .execute();
    // f1 5 星、f3 4.5 星（4+5 两条）、f5 3 星、f7 1 星、f9 无评分（NULL 排最后）。
    const rated: ReadonlyArray<{
      id: string;
      versionId: string;
      name: string;
      stars: readonly number[];
    }> = [
      {
        id: "00000000-0000-0000-0000-0000000000f1",
        versionId: "00000000-0000-0000-0000-0000000000f2",
        name: "评分五",
        stars: [5],
      },
      {
        id: "00000000-0000-0000-0000-0000000000f3",
        versionId: "00000000-0000-0000-0000-0000000000f4",
        name: "评分四半",
        stars: [4, 5],
      },
      {
        id: "00000000-0000-0000-0000-0000000000f5",
        versionId: "00000000-0000-0000-0000-0000000000f6",
        name: "评分三",
        stars: [3],
      },
      {
        id: "00000000-0000-0000-0000-0000000000f7",
        versionId: "00000000-0000-0000-0000-0000000000f8",
        name: "评分一",
        stars: [1],
      },
      {
        id: "00000000-0000-0000-0000-0000000000f9",
        versionId: "00000000-0000-0000-0000-0000000000fa",
        name: "未评分",
        stars: [],
      },
    ];
    for (const app of rated) {
      await seedApplication(db, {
        applicationId: app.id,
        versionId: app.versionId,
        name: app.name,
        summary: app.name,
        searchName: app.name,
        searchSummary: app.name,
        searchPinyin: "px",
        searchInitials: "px",
        categoryId: "ratings-cat",
      });
      for (const [employee, stars] of app.stars.entries()) {
        await db
          .insertInto("application_ratings")
          .values({
            application_id: app.id,
            application_version_id: app.versionId,
            employee_id: employee === 0 ? "E100" : "E101",
            stars,
            body: null,
            display_anonymously: false,
          })
          .execute();
      }
    }

    const repository = new KyselyCatalogRepository(db);
    const all = await repository.listVisiblePage({
      actor,
      categoryId: "ratings-cat",
      sort: "rating",
      page: 1,
      pageSize: 10,
    });
    expect(all.total).toBe(5);
    expect(all.items.map((item) => item.name)).toEqual([
      "评分五",
      "评分四半",
      "评分三",
      "评分一",
      "未评分",
    ]);
    expect(all.items.map((item) => item.ratingAverage)).toEqual([
      5,
      4.5,
      3,
      1,
      null,
    ]);

    // 跨页拼接顺序与单页一致 —— 排序发生在服务端，而非页内重排。
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        repository.listVisiblePage({
          actor,
          categoryId: "ratings-cat",
          sort: "rating",
          page,
          pageSize: 2,
        }),
      ),
    );
    expect(pages.map((page) => page.items.map((item) => item.name))).toEqual([
      ["评分五", "评分四半"],
      ["评分三", "评分一"],
      ["未评分"],
    ]);
  });
});
