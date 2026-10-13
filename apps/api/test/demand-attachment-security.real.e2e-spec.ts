import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createDatabase, runMigrations } from "@ai-hub/database";
import {
  ArtifactPipeline,
  ClamAvMalwareScanner,
  DiskObjectStorage,
  KyselyIdentityRepository,
} from "@ai-hub/server";
import {
  startClamAvTestContainer,
  startPostgresTestContainer,
} from "@ai-hub/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiModule } from "../src/api.module.js";
import { configureApiBodyParsers } from "../src/body-parser.js";

describe("需求附件真实扫描与隔离门禁", () => {
  const suffix = randomUUID();
  const employeeId = `ATTACHMENT-${suffix}`.toUpperCase();
  let db: ReturnType<typeof createDatabase>;
  let stopDatabase: (() => Promise<void>) | undefined;
  let stopScanner: (() => Promise<void>) | undefined;
  let app: NestExpressApplication;
  let storage: DiskObjectStorage;
  let storageDirectory: string;
  let headers: Record<string, string>;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stopDatabase = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    const repository = new KyselyIdentityRepository(db);
    await repository.createDepartment({
      departmentId: suffix,
      name: "附件门禁部门",
      parentDepartmentId: null,
      source: "local",
    });
    await repository.createEmployee({
      employeeId,
      displayName: "附件门禁员工",
      primaryDepartmentId: suffix,
      status: "active",
    });
    await repository.assignRole(employeeId, "employee");
    const session = await repository.createSession({
      employeeId,
      deviceLabel: "附件门禁",
      expiresAt: new Date(Date.now() + 300_000),
    });
    headers = {
      "x-employee-id": employeeId,
      "x-session-id": session.sessionId,
    };
    storageDirectory = await mkdtemp(join(tmpdir(), "ai-hub-demand-security-"));
    storage = new DiskObjectStorage(storageDirectory);
    const scannerContainer = await startClamAvTestContainer();
    stopScanner = scannerContainer.stop;
    const scanner = new ClamAvMalwareScanner(
      scannerContainer.host,
      scannerContainer.port,
      5_000,
    );
    expect(await scanner.scan(Buffer.from("附件扫描预检。"))).toBe("clean");
    const pipeline = new ArtifactPipeline(storage, {
      scan: (content) => scanner.scan(content),
      verify: async () => {
        throw new Error("此附件测试不使用签名校验");
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.register(
          db,
          {},
          pipeline,
          undefined,
          storageDirectory,
          undefined,
          storage,
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApiBodyParsers(app, 64 * 1024 * 1024, 10 * 1024 * 1024);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await stopScanner?.();
    await stopDatabase?.();
    if (storageDirectory !== undefined) {
      if (
        dirname(resolve(storageDirectory)) !== resolve(tmpdir()) ||
        !basename(storageDirectory).startsWith("ai-hub-demand-security-")
      ) {
        throw new Error("附件测试清理目录超出临时目录");
      }
      await rm(storageDirectory, { recursive: true, force: true });
    }
  }, 60_000);

  function upload(content: Buffer) {
    return request(app.getHttpServer())
      .post("/internal/demands/uploads")
      .set(headers)
      .set("content-type", "application/octet-stream")
      .set("x-file-name", "evidence.txt")
      .set("x-file-mime", "text/plain")
      .send(content);
  }

  it("真实 ClamAV 确认干净内容后才创建附件记录，摘要与实际文件一致", async () => {
    const content = Buffer.from("用于需求验收的安全附件内容。");
    const response = await upload(content).expect(201);
    const row = await db
      .selectFrom("ai_demand_attachments")
      .selectAll()
      .where("attachment_id", "=", response.body.attachmentId as string)
      .executeTakeFirstOrThrow();
    expect(row.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(await storage.get(row.storage_key)).toEqual(new Uint8Array(content));
  });

  it("真实 ClamAV 拒绝 EICAR，拒绝内容不留附件记录或隔离文件", async () => {
    const response = await upload(
      Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      ),
    ).expect(400);
    expect(response.body.code).toBe("MALWARE_DETECTED");
    expect(
      await db
        .selectFrom("ai_demand_attachments")
        .select("attachment_id")
        .where("uploaded_by_employee_id", "=", employeeId)
        .execute(),
    ).toHaveLength(1);
    expect(
      await readdir(join(storageDirectory, "demands", "attachments")),
    ).toHaveLength(1);
  });

  it("真实扫描器停止后失败关闭，不接受未扫描文件", async () => {
    await stopScanner?.();
    stopScanner = undefined;
    const response = await upload(
      Buffer.from("扫描服务不可用时也不能接受附件。"),
    ).expect(400);
    expect(response.body.code).toBe("ARTIFACT_SECURITY_UNAVAILABLE");
    expect(
      await readdir(join(storageDirectory, "demands", "attachments")),
    ).toHaveLength(1);
  });
});
