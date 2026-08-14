import { Readable } from "node:stream";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ARTIFACT_MAX_SIZE_BYTES,
  ARTIFACT_PIPELINE,
  ARTIFACT_STORAGE,
  ArtifactPipeline,
  ArtifactUploadController,
  IdentityService,
  KyselyApplicationRepository,
  type ApplicationRecord,
  type ArtifactUploadRecord,
  type AssetRecord,
  type ReadableObjectStoragePort,
} from "@ai-hub/server";
import { configureApiBodyParsers } from "../src/body-parser.js";

const MAX_ARTIFACT_BYTES = 16;
const application: ApplicationRecord = {
  applicationId: "app-1",
  ownerEmployeeId: "E100",
  maintainerEmployeeId: "E100",
  departmentId: "dept-platform",
  name: "Artifact test",
  summary: "Artifact test",
  status: "draft",
  currentVersionId: null,
};

class TestStorage implements ReadableObjectStoragePort {
  readonly objects = new Map<string, Buffer>();
  readonly completionEvents: string[] = [];
  failDelete = false;

  async put(key: string, content: Uint8Array): Promise<void> {
    this.objects.set(key, Buffer.from(content));
  }

  async putStream(
    key: string,
    stream: NodeJS.ReadableStream,
  ): Promise<number> {
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
    this.completionEvents.push("copy");
  }

  async delete(key: string): Promise<void> {
    this.completionEvents.push("delete");
    if (this.failDelete) throw new Error("DELETE_UNAVAILABLE");
    this.objects.delete(key);
  }

  async openReadStream(key: string): Promise<NodeJS.ReadableStream | null> {
    const content = this.objects.get(key);
    return content === undefined ? null : Readable.from(content);
  }
}

class TestApplicationRepository {
  readonly uploads = new Map<string, ArtifactUploadRecord>();
  readonly assets = new Map<string, AssetRecord>();
  readonly completionEvents: string[];
  private nextId = 1;

  constructor(completionEvents: string[]) {
    this.completionEvents = completionEvents;
  }

  async findApplication(applicationId: string) {
    return applicationId === application.applicationId ? application : null;
  }

  async createArtifactUpload(
    input: Omit<ArtifactUploadRecord, "uploadId" | "createdAt" | "completedAt">,
  ) {
    const record: ArtifactUploadRecord = {
      ...input,
      uploadId: `upload-${this.nextId++}`,
      completedAt: null,
      createdAt: new Date(),
    };
    this.uploads.set(record.uploadId, record);
    return record;
  }

  async findArtifactUpload(uploadId: string) {
    return this.uploads.get(uploadId) ?? null;
  }

  async updateArtifactUpload(
    uploadId: string,
    input: Partial<ArtifactUploadRecord>,
  ) {
    const current = this.uploads.get(uploadId);
    if (current === undefined) return null;
    const updated = { ...current, ...input };
    this.uploads.set(uploadId, updated);
    if (input.uploadStatus === "completed" && input.scanStatus === "passed") {
      this.completionEvents.push("db-passed");
    }
    return updated;
  }

  async listAssets() {
    return [...this.assets.values()];
  }

  async createAsset(input: Omit<AssetRecord, "assetId" | "createdAt">) {
    const record: AssetRecord = {
      ...input,
      assetId: `asset-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.assets.set(record.assetId, record);
    return record;
  }

  async findAsset(assetId: string) {
    return this.assets.get(assetId) ?? null;
  }

  async deleteAsset(assetId: string) {
    this.assets.delete(assetId);
  }
}

describe("artifact upload API", () => {
  let app: INestApplication;
  let storage: TestStorage;
  let repository: TestApplicationRepository;

  beforeAll(async () => {
    storage = new TestStorage();
    repository = new TestApplicationRepository(storage.completionEvents);
    const identity = {
      async getActorContext(employeeId: string, sessionId: string) {
        return {
          employeeId,
          roleCodes: ["application_owner"],
          departmentIds: ["dept-platform"],
          primaryDepartmentId: "dept-platform",
          sessionId,
        };
      },
      async authorize() {
        return { allowed: true, reasonCode: "ALLOW_TEST" };
      },
    };
    const pipeline = new ArtifactPipeline(storage, {
      async scan() {
        return "clean";
      },
      async verify(_content, signature) {
        return signature === "valid-signature";
      },
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [ArtifactUploadController],
      providers: [
        { provide: KyselyApplicationRepository, useValue: repository },
        { provide: IdentityService, useValue: identity },
        { provide: ARTIFACT_STORAGE, useValue: storage },
        { provide: ARTIFACT_PIPELINE, useValue: pipeline },
        { provide: ARTIFACT_MAX_SIZE_BYTES, useValue: MAX_ARTIFACT_BYTES },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApiBodyParsers(
      app as NestExpressApplication,
      MAX_ARTIFACT_BYTES,
    );
    await app.init();
  });

  beforeEach(() => {
    repository.uploads.clear();
    repository.assets.clear();
    storage.objects.clear();
    storage.completionEvents.length = 0;
    storage.failDelete = false;
  });

  afterAll(async () => {
    await app.close();
  });

  const ownerHeaders = {
    "x-employee-id": "E100",
    "x-session-id": "session-E100",
  };

  function createUpload(sizeBytes: number) {
    return request(app.getHttpServer())
      .post("/internal/applications/app-1/artifact-uploads")
      .set(ownerHeaders)
      .send({ fileName: "artifact.zip", mimeType: "application/zip", sizeBytes });
  }

  it("accepts an application/octet-stream body and preserves its exact bytes", async () => {
    const content = Buffer.from("artifact");
    const created = await createUpload(content.byteLength).expect(201);

    const uploaded = await request(app.getHttpServer())
      .put(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}/content`,
      )
      .set(ownerHeaders)
      .set("content-type", "application/octet-stream")
      .send(content)
      .expect(200);

    expect(uploaded.body.sha256).toBe(
      "c7c5c1d70c5dec44c05970fba15e1207557e2b98fbde3d4f933a7e005995ed45",
    );
    expect(storage.objects.get(created.body.objectKey)).toEqual(content);
  });

  it("uses the configured artifact limit for both declaration and raw parsing", async () => {
    await createUpload(0).expect(400);
    await createUpload(Number.MAX_SAFE_INTEGER + 1).expect(400);
    await createUpload(MAX_ARTIFACT_BYTES + 1).expect(400);

    const created = await createUpload(MAX_ARTIFACT_BYTES).expect(201);
    await request(app.getHttpServer())
      .put(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}/content`,
      )
      .set(ownerHeaders)
      .set("content-type", "application/octet-stream")
      .send(Buffer.alloc(MAX_ARTIFACT_BYTES + 1))
      .expect(413);
  });

  it("rejects a raw body whose byte length differs from the declaration", async () => {
    const created = await createUpload(9).expect(201);
    await request(app.getHttpServer())
      .put(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}/content`,
      )
      .set(ownerHeaders)
      .set("content-type", "application/octet-stream")
      .send(Buffer.from("artifact"))
      .expect(400);
    expect(storage.objects).not.toHaveProperty(created.body.objectKey);
  });

  it("completes only after copy and DB evidence, while cleanup is best effort", async () => {
    const content = Buffer.from("artifact");
    const created = await createUpload(content.byteLength).expect(201);
    await request(app.getHttpServer())
      .put(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}/content`,
      )
      .set(ownerHeaders)
      .set("content-type", "application/octet-stream")
      .send(content)
      .expect(200);
    storage.completionEvents.length = 0;
    storage.failDelete = true;

    const completed = await request(app.getHttpServer())
      .post(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}/complete`,
      )
      .set(ownerHeaders)
      .send({ signature: "valid-signature" })
      .expect(200);

    expect(storage.completionEvents).toEqual(["copy", "db-passed", "delete"]);
    expect(completed.body).toMatchObject({
      uploadStatus: "completed",
      scanStatus: "passed",
      objectKey: `applications/app-1/artifacts/${created.body.uploadId}`,
    });
    expect(
      storage.objects.get(
        `applications/app-1/artifacts/${created.body.uploadId}`,
      ),
    ).toEqual(content);
  });

  it("fails closed when verification is unavailable", async () => {
    const content = Buffer.from("artifact");
    const created = await createUpload(content.byteLength).expect(201);
    await request(app.getHttpServer())
      .put(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}/content`,
      )
      .set(ownerHeaders)
      .set("content-type", "application/octet-stream")
      .send(content)
      .expect(200);

    const unavailablePipeline = new ArtifactPipeline(storage, {
      async scan() {
        throw new Error("SCANNER_UNAVAILABLE");
      },
      async verify() {
        return true;
      },
    });
    const controller = app.get(ArtifactUploadController) as unknown as {
      pipeline: ArtifactPipeline;
    };
    controller.pipeline = unavailablePipeline;

    const failed = await request(app.getHttpServer())
      .post(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}/complete`,
      )
      .set(ownerHeaders)
      .send({ signature: "valid-signature" })
      .expect(200);

    expect(failed.body).toMatchObject({
      uploadStatus: "failed",
      scanStatus: "failed",
      errorCode: "ARTIFACT_SECURITY_UNAVAILABLE",
    });
    expect(storage.completionEvents).not.toContain("copy");
  });

  it("requires both the application owner and the original uploader", async () => {
    await request(app.getHttpServer())
      .post("/internal/applications/app-1/artifact-uploads")
      .set({
        "x-employee-id": "E200",
        "x-session-id": "session-E200",
      })
      .send({ fileName: "artifact.zip", mimeType: "application/zip", sizeBytes: 8 })
      .expect(403);

    const created = await createUpload(8).expect(201);
    const current = repository.uploads.get(created.body.uploadId)!;
    repository.uploads.set(created.body.uploadId, {
      ...current,
      uploadedByEmployeeId: "E200",
    });
    await request(app.getHttpServer())
      .get(
        `/internal/applications/app-1/artifact-uploads/${created.body.uploadId}`,
      )
      .set(ownerHeaders)
      .expect(403);
  });

  it("rejects asset keys outside the application namespace", async () => {
    await request(app.getHttpServer())
      .post("/internal/applications/app-1/assets")
      .set(ownerHeaders)
      .send({
        assetType: "attachment",
        name: "foreign.zip",
        storageKey: "applications/app-2/artifacts/foreign.zip",
        mimeType: "application/zip",
        sizeBytes: 8,
      })
      .expect(400);
    expect(repository.assets).toHaveLength(0);
  });

  it("caps JSON request bodies at 1 MiB", async () => {
    await request(app.getHttpServer())
      .post("/internal/applications/app-1/artifact-uploads")
      .set(ownerHeaders)
      .send({
        fileName: "artifact.zip",
        mimeType: "application/zip",
        sizeBytes: 8,
        padding: "x".repeat(1024 * 1024),
      })
      .expect(413);
  });
});
