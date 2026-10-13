import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { createDatabase, runMigrations } from "@ai-hub/database";
import {
  DiskObjectStorage,
  KyselyApplicationRepository,
  KyselyIdentityRepository,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiModule } from "../src/api.module.js";

describe("Portal 与 Catalog 的真实受众边界", () => {
  const suffix = randomUUID();
  const rootDepartmentId = `audience-root-${suffix}`;
  const childDepartmentId = `audience-child-${suffix}`;
  const otherDepartmentId = `audience-other-${suffix}`;
  const employeeId = (name: string) =>
    `AUDIENCE-${name}-${suffix}`.toUpperCase();
  const ownerId = employeeId("OWNER");
  const rootId = employeeId("ROOT");
  const childId = employeeId("CHILD");
  const targetId = employeeId("TARGET");
  const outsiderId = employeeId("OUTSIDER");
  const content = Buffer.from("受众隔离文件内容");
  const resources = new Map<
    string,
    { applicationId: string; assetId: string; entryId: string }
  >();
  const actors = new Map<string, Record<string, string>>();
  let periodId: string;
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let app: INestApplication;
  let storageDirectory: string;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    const identity = new KyselyIdentityRepository(db);
    for (const departmentId of [
      rootDepartmentId,
      childDepartmentId,
      otherDepartmentId,
    ]) {
      await identity.createDepartment({
        departmentId,
        name: "受众测试部门",
        parentDepartmentId:
          departmentId === childDepartmentId ? rootDepartmentId : null,
        source: "local",
      });
    }
    for (const id of [ownerId, rootId, childId, targetId, outsiderId]) {
      await identity.createEmployee({
        employeeId: id,
        displayName: "受众测试员工",
        status: "active",
        primaryDepartmentId:
          id === childId
            ? childDepartmentId
            : id === targetId || id === outsiderId
              ? otherDepartmentId
              : rootDepartmentId,
      });
      await identity.assignRole(id, "employee");
      const session = await identity.createSession({
        employeeId: id,
        deviceLabel: "受众门禁",
        expiresAt: new Date(Date.now() + 300_000),
      });
      actors.set(id, {
        "x-employee-id": id,
        "x-session-id": session.sessionId,
      });
    }
    storageDirectory = await mkdtemp(join(tmpdir(), "ai-hub-portal-audience-"));
    const storage = new DiskObjectStorage(storageDirectory);
    const repository = new KyselyApplicationRepository(db);
    const categoryId = `audience-category-${suffix}`;
    await db
      .insertInto("catalog_categories")
      .values({
        category_id: categoryId,
        name: "受众测试分类",
        sort_order: 0,
        enabled: true,
        is_hot: false,
      })
      .execute();
    const period = await db
      .insertInto("portal_app_hunt_periods")
      .values({
        name: "受众门禁活动",
        starts_at: new Date(Date.now() - 60_000),
        ends_at: new Date(Date.now() + 300_000),
        status: "active",
      })
      .returning("period_id")
      .executeTakeFirstOrThrow();
    periodId = period.period_id;
    for (const name of ["all", "department", "children", "employee", "none"]) {
      const application = await repository.createApplication({
        ownerEmployeeId: ownerId,
        maintainerEmployeeId: ownerId,
        departmentId: rootDepartmentId,
        name: `受众-${name}`,
        summary: "受众隔离公开资料",
      });
      const version = await repository.createVersion({
        applicationVersionId: randomUUID(),
        applicationId: application.applicationId,
        version: "1.0.0",
        changelog: "受众边界测试数据",
        artifactKey: null,
        artifactSha256: null,
        artifactSignature: null,
        scanStatus: "passed",
        createdByEmployeeId: ownerId,
      });
      await repository.upsertCatalogMetadata(application.applicationId, {
        categoryId,
        applicationType: "web_app",
      });
      await repository.replaceAudiences(
        application.applicationId,
        name === "none"
          ? []
          : [
              {
                audienceType:
                  name === "all"
                    ? "all"
                    : name === "employee"
                      ? "employee"
                      : "department",
                departmentId:
                  name === "department" || name === "children"
                    ? rootDepartmentId
                    : null,
                employeeId: name === "employee" ? targetId : null,
                includeChildren: name === "children",
              },
            ],
      );
      const storageKey = `audience/${application.applicationId}/evidence`;
      await storage.put(storageKey, content);
      const asset = await repository.createAsset({
        applicationId: application.applicationId,
        applicationVersionId: version.applicationVersionId,
        assetType: "attachment",
        name: "受众验收.txt",
        storageKey,
        mimeType: "text/plain",
        sizeBytes: content.byteLength,
        sortOrder: 0,
        sha256: null,
        scanStatus: "passed",
        uploadedByEmployeeId: ownerId,
      });
      await repository.snapshotVersionContent(version.applicationVersionId, {
        attachmentAssetIds: [asset.assetId],
      });
      await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: "draft",
        status: "published",
        currentVersionId: version.applicationVersionId,
      });
      const entry = await db
        .insertInto("portal_app_hunt_entries")
        .values({
          period_id: periodId,
          application_id: application.applicationId,
          nominated_by_employee_id: ownerId,
        })
        .returning("entry_id")
        .executeTakeFirstOrThrow();
      resources.set(name, {
        applicationId: application.applicationId,
        assetId: asset.assetId,
        entryId: entry.entry_id,
      });
    }
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.register(
          db,
          {},
          undefined,
          undefined,
          storageDirectory,
          undefined,
          storage,
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await stop?.();
    if (storageDirectory !== undefined) {
      if (
        dirname(resolve(storageDirectory)) !== resolve(tmpdir()) ||
        !basename(storageDirectory).startsWith("ai-hub-portal-audience-")
      )
        throw new Error("受众测试清理目录超出临时目录");
      await rm(storageDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    { label: "匿名", viewerId: null, names: ["all"] },
    {
      label: "本部门",
      viewerId: rootId,
      names: ["all", "department", "children"],
    },
    { label: "下级部门", viewerId: childId, names: ["all", "children"] },
    { label: "指定跨部门员工", viewerId: targetId, names: ["all", "employee"] },
    { label: "无关跨部门员工", viewerId: outsiderId, names: ["all"] },
  ])(
    "$label 的列表、详情、聚合、活动和文件边界一致",
    async ({ viewerId, names }) => {
      const headers = viewerId === null ? {} : actors.get(viewerId)!;
      const expectedIds = names
        .map((name) => resources.get(name)!.applicationId)
        .sort();
      const list = await request(app.getHttpServer())
        .get("/internal/portal/apps")
        .set(headers)
        .expect(200);
      expect(
        list.body.items
          .map((row: { resourceId: string }) => row.resourceId)
          .sort(),
      ).toEqual(expectedIds);
      expect(list.body.total).toBe(expectedIds.length);
      const home = await request(app.getHttpServer())
        .get("/internal/portal/home")
        .set(headers)
        .expect(200);
      expect(
        home.body.apps
          .map((row: { resourceId: string }) => row.resourceId)
          .sort(),
      ).toEqual(expectedIds);
      const departments = await request(app.getHttpServer())
        .get("/internal/portal/departments")
        .set(headers)
        .expect(200);
      expect(
        departments.body.find(
          (row: { departmentId: string }) =>
            row.departmentId === rootDepartmentId,
        )?.applicationCount,
      ).toBe(expectedIds.length);
      const department = await request(app.getHttpServer())
        .get(`/internal/portal/departments/${rootDepartmentId}`)
        .set(headers)
        .expect(200);
      expect(
        department.body.applications
          .map((row: { resourceId: string }) => row.resourceId)
          .sort(),
      ).toEqual(expectedIds);
      const hunt = await request(app.getHttpServer())
        .get("/internal/portal/apps-hunt")
        .set(headers)
        .expect(200);
      expect(
        hunt.body
          .map((row: { applicationId: string }) => row.applicationId)
          .sort(),
      ).toEqual(expectedIds);
      if (viewerId !== null) {
        const catalog = await request(app.getHttpServer())
          .get("/internal/catalog")
          .set(headers)
          .expect(200);
        expect(
          catalog.body.items
            .map((row: { applicationId: string }) => row.applicationId)
            .sort(),
        ).toEqual(expectedIds);
      }
      for (const [name, resource] of resources) {
        const visible = names.includes(name);
        await request(app.getHttpServer())
          .get(`/internal/portal/apps/${ownerId}/${resource.applicationId}`)
          .set(headers)
          .expect(visible ? 200 : 404);
        await request(app.getHttpServer())
          .get(
            `/internal/portal/apps/${resource.applicationId}/assets/${resource.assetId}/content`,
          )
          .set(headers)
          .expect(viewerId === null ? 401 : visible ? 200 : 404);
      }
    },
  );

  it("禁止向未授权的受限应用投票", async () => {
    const resource = resources.get("department")!;
    await request(app.getHttpServer())
      .post("/internal/portal/apps-hunt/votes")
      .set(actors.get(outsiderId)!)
      .send({ periodId, entryId: resource.entryId })
      .expect(404);
    expect(
      await db
        .selectFrom("portal_app_hunt_votes")
        .select("vote_id")
        .where("employee_id", "=", outsiderId)
        .execute(),
    ).toEqual([]);
  });
});
