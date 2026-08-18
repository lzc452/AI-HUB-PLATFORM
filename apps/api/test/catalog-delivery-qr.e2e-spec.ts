import { Readable } from "node:stream";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ARTIFACT_STORAGE,
  CatalogController,
  CatalogService,
  IdentityService,
  ObservabilityModule,
  PermissionGuard,
  type ReadableObjectStoragePort,
} from "@ai-hub/server";

// CATALOG_SERVICE 是字符串令牌（packages/server/src/catalog/catalog.tokens.ts）。
const CATALOG_SERVICE = "CATALOG_SERVICE";

const QR_CONTENT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

class TestStorage implements ReadableObjectStoragePort {
  readonly objects = new Map<string, Buffer>();

  async put(key: string, content: Uint8Array): Promise<void> {
    this.objects.set(key, Buffer.from(content));
  }

  async putStream(key: string, stream: NodeJS.ReadableStream): Promise<number> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const content = Buffer.concat(chunks);
    this.objects.set(key, content);
    return content.byteLength;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const content = this.objects.get(key);
    return content === undefined ? null : Buffer.from(content);
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const content = this.objects.get(sourceKey);
    if (content === undefined) throw new Error("OBJECT_NOT_FOUND");
    this.objects.set(destinationKey, Buffer.from(content));
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async openReadStream(key: string): Promise<NodeJS.ReadableStream | null> {
    const content = this.objects.get(key);
    return content === undefined ? null : Readable.from(content);
  }
}

function binaryParser() {
  // supertest 的 .parse() 类型签名是 (str: string) => any，但运行时按
  // superagent 的 (response, callback) 调用；这里按实际运行时形状定义。
  return ((
    response: NodeJS.ReadableStream,
    callback: (error: Error | null, body: Buffer) => void,
  ) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    response.on("end", () => callback(null, Buffer.concat(chunks)));
  }) as unknown as (str: string) => unknown;
}

describe("GET /internal/catalog/deliveries/:deliveryId/qr", () => {
  let app: INestApplication;
  let storage: TestStorage;
  let qrAsset: { storageKey: string; mimeType: string } | null;

  const identity = {
    async getActorContext(employeeId: string, sessionId: string) {
      if (sessionId === "session-invalid") throw new Error("SESSION_INVALID");
      const visible = employeeId === "E100";
      return {
        employeeId,
        displayName: employeeId,
        roleCodes: ["employee"],
        permissions: ["catalog.read"],
        departmentIds: visible ? ["dept-platform"] : ["dept-finance"],
        primaryDepartmentId: visible ? "dept-platform" : "dept-finance",
        sessionId,
      };
    },
    async authorize() {
      return { allowed: true, reasonCode: "ALLOW_TEST" };
    },
  } as unknown as IdentityService;

  const catalog = {
    async getQrAsset(
      actor: { departmentIds: readonly string[] },
      deliveryId: string,
    ) {
      if (!actor.departmentIds.includes("dept-platform")) {
        throw new Error("CATALOG_APPLICATION_NOT_FOUND");
      }
      if (deliveryId !== "delivery-1" || qrAsset === null) {
        throw new Error("CATALOG_DELIVERY_ASSET_NOT_FOUND");
      }
      return qrAsset;
    },
  } as unknown as CatalogService;

  beforeAll(async () => {
    storage = new TestStorage();
    qrAsset = { storageKey: "qr/wechat.png", mimeType: "image/png" };
    const moduleRef = await Test.createTestingModule({
      imports: [ObservabilityModule.register()],
      controllers: [CatalogController],
      providers: [
        { provide: CATALOG_SERVICE, useValue: catalog },
        { provide: IdentityService, useValue: identity },
        { provide: ARTIFACT_STORAGE, useValue: storage },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("拒绝缺少身份凭据的请求（401）", async () => {
    await request(app.getHttpServer())
      .get("/internal/catalog/deliveries/delivery-1/qr")
      .expect(401);
  });

  it("拒绝无目录读权限的演员（403）", async () => {
    // 无 catalog.read 权限的演员：PermissionGuard 直接拒绝。
    const noPermissionIdentity = {
      ...identity,
      async getActorContext(employeeId: string, sessionId: string) {
        const actor = await identity.getActorContext(employeeId, sessionId);
        return { ...actor, permissions: [] };
      },
    } as unknown as IdentityService;
    const noPermissionModule = await Test.createTestingModule({
      imports: [ObservabilityModule.register()],
      controllers: [CatalogController],
      providers: [
        { provide: CATALOG_SERVICE, useValue: catalog },
        { provide: IdentityService, useValue: noPermissionIdentity },
        { provide: ARTIFACT_STORAGE, useValue: storage },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const appNoPermission = noPermissionModule.createNestApplication();
    await appNoPermission.init();
    try {
      await request(appNoPermission.getHttpServer())
        .get("/internal/catalog/deliveries/delivery-1/qr")
        .set("x-employee-id", "E100")
        .set("x-session-id", "session-100")
        .expect(403);
    } finally {
      await appNoPermission.close();
    }
  });

  it("流式返回二维码图片（Content-Type image/png）", async () => {
    storage.objects.set("qr/wechat.png", QR_CONTENT);

    const response = await request(app.getHttpServer())
      .get("/internal/catalog/deliveries/delivery-1/qr")
      .set("x-employee-id", "E100")
      .set("x-session-id", "session-100")
      .buffer(true)
      .parse(binaryParser())
      .expect(200);

    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.body).toEqual(QR_CONTENT);
  });

  it("受众外员工不可访问（404 CATALOG_APPLICATION_NOT_FOUND）", async () => {
    storage.objects.set("qr/wechat.png", QR_CONTENT);

    const response = await request(app.getHttpServer())
      .get("/internal/catalog/deliveries/delivery-1/qr")
      .set("x-employee-id", "E200")
      .set("x-session-id", "session-200")
      .expect(404);

    expect(response.body.code).toBe("CATALOG_APPLICATION_NOT_FOUND");
  });

  it("未配置二维码资产时返回 404 CATALOG_DELIVERY_ASSET_NOT_FOUND", async () => {
    qrAsset = null;

    const response = await request(app.getHttpServer())
      .get("/internal/catalog/deliveries/delivery-1/qr")
      .set("x-employee-id", "E100")
      .set("x-session-id", "session-100")
      .expect(404);

    expect(response.body.code).toBe("CATALOG_DELIVERY_ASSET_NOT_FOUND");
  });

  it("存储中对象缺失时返回 404 CATALOG_DELIVERY_ASSET_NOT_FOUND", async () => {
    qrAsset = { storageKey: "qr/wechat.png", mimeType: "image/png" };
    storage.objects.delete("qr/wechat.png");

    const response = await request(app.getHttpServer())
      .get("/internal/catalog/deliveries/delivery-1/qr")
      .set("x-employee-id", "E100")
      .set("x-session-id", "session-100")
      .expect(404);

    expect(response.body.code).toBe("CATALOG_DELIVERY_ASSET_NOT_FOUND");
  });
});
