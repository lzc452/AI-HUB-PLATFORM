import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import { ApplicationService } from "./application.service.js";
import type {
  ApplicationRecord,
  ApplicationRepository,
  ApplicationVersionRecord,
  ArtifactUploadRecord,
  ValidationCheckRecord,
} from "./application.types.js";
import { ArtifactPipeline } from "./storage.pipeline.js";
import type { ReadableObjectStoragePort } from "./storage.port.js";
import { UnifiedUploadController } from "./unified-upload.controller.js";
import { ApplicationUploadService } from "./application-upload.service.js";
import { PortalApplicationUploadController } from "./portal-application-upload.controller.js";
import type { AssetRecord } from "./application.types.js";

const owner: ActorContext = {
  employeeId: "E100",
  roleCodes: ["application_owner"],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-owner",
};

const content = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]); // PK zip 头

class MemoryUploadStorage implements ReadableObjectStoragePort {
  readonly objects = new Map<string, Uint8Array>();

  async put(key: string, value: Uint8Array): Promise<void> {
    this.objects.set(key, new Uint8Array(value));
  }

  async putStream(key: string, stream: NodeJS.ReadableStream): Promise<number> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const value = Buffer.concat(chunks);
    this.objects.set(key, value);
    return value.byteLength;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const value = this.objects.get(key);
    return value === undefined ? null : new Uint8Array(value);
  }

  async openReadStream(key: string): Promise<NodeJS.ReadableStream | null> {
    const value = this.objects.get(key);
    return value === undefined ? null : Readable.from(new Uint8Array(value));
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const value = this.objects.get(sourceKey);
    if (value === undefined) throw new Error("OBJECT_NOT_FOUND");
    this.objects.set(destinationKey, new Uint8Array(value));
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

/** 仅实现本测试用到的仓库面（无需实现完整 ApplicationRepository）。 */
class MemoryApplicationRepository {
  applications = new Map<string, ApplicationRecord>();
  uploads = new Map<string, ArtifactUploadRecord>();
  assets = new Map<string, AssetRecord>();
  versions = new Map<string, ApplicationVersionRecord>();
  validationChecks: ValidationCheckRecord[] = [];
  audits: string[] = [];
  events: string[] = [];
  nextId = 1;

  async withTransaction<T>(
    operation: (repository: this) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
  async findApplication(id: string) {
    return this.applications.get(id) ?? null;
  }
  async createArtifactUpload(
    input: Omit<ArtifactUploadRecord, "uploadId" | "createdAt" | "completedAt">,
  ) {
    const record: ArtifactUploadRecord = {
      ...input,
      uploadId: `upload-${this.nextId++}`,
      createdAt: new Date(),
      completedAt: null,
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
    return updated;
  }
  async createAsset(input: Omit<AssetRecord, "assetId" | "createdAt">) {
    const asset: AssetRecord = {
      ...input,
      assetId: `asset-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.assets.set(asset.assetId, asset);
    return asset;
  }
  async listAssets(applicationId: string) {
    return [...this.assets.values()].filter(
      (asset) => asset.applicationId === applicationId,
    );
  }
  async findVerifiedArtifact(input: {
    applicationId: string;
    objectKey: string;
    sha256: string;
    signature: string | null;
  }) {
    // 空字符串语义等同未签名（与 Kysely 实现一致）。
    const signature = input.signature === "" ? null : input.signature;
    return (
      [...this.uploads.values()].find(
        (upload) =>
          upload.applicationId === input.applicationId &&
          upload.objectKey === input.objectKey &&
          upload.sha256 === input.sha256 &&
          upload.signature === signature &&
          upload.uploadStatus === "completed" &&
          upload.scanStatus === "passed",
      ) ?? null
    );
  }
  async listVersions(applicationId: string) {
    return [...this.versions.values()].filter(
      (version) => version.applicationId === applicationId,
    );
  }
  async createVersion(input: Omit<ApplicationVersionRecord, "createdAt">) {
    const version = { ...input, createdAt: new Date() };
    this.versions.set(version.applicationVersionId, version);
    return version;
  }
  async recordValidationCheck(input: {
    applicationVersionId: string;
    checkCode: string;
    label: string;
    status: "passed" | "safe" | "warning" | "info" | "failed";
    detail: string | null;
  }) {
    this.validationChecks.push({
      validationCheckId: `check-${this.nextId++}`,
      createdAt: new Date(),
      ...input,
    });
  }
  async recordAudit(input: { eventType: string }) {
    this.audits.push(input.eventType);
  }
  async emitOutbox(input: { eventType: string }) {
    this.events.push(input.eventType);
  }
}

function makeHarness() {
  const storage = new MemoryUploadStorage();
  const repository = new MemoryApplicationRepository();
  const pipeline = new ArtifactPipeline(storage, {
    async scan() {
      return "clean";
    },
    async verify() {
      return true;
    },
  });
  const uploads = new ApplicationUploadService(
    repository as never,
    storage,
    pipeline,
  );
  const controller = new UnifiedUploadController(uploads);
  const portalController = new PortalApplicationUploadController(uploads);
  const service = new ApplicationService(
    repository as unknown as ApplicationRepository,
    { authorize: async () => ({ allowed: true, reasonCode: "ALLOW_TEST" }) },
    {
      async verifyArtifact() {
        return { accepted: true, scanStatus: "passed" as const, sha256: "" };
      },
    },
  );
  return { repository, controller, portalController, service };
}

describe("UnifiedUploadController artifact completion", () => {
  it("completes unsigned artifacts with signed=false and enforces the acceptUnsigned gate", async () => {
    const { repository, controller, service } = makeHarness();
    const application: ApplicationRecord = {
      applicationId: "app-1",
      ownerEmployeeId: owner.employeeId,
      maintainerEmployeeId: owner.employeeId,
      departmentId: "dept-rnd",
      name: "App",
      summary: "App",
      status: "draft",
      currentVersionId: null,
      pendingVersionId: null,
    };
    repository.applications.set(application.applicationId, application);

    const created = await controller.createUpload(
      "app-1",
      owner.employeeId,
      owner.sessionId,
      owner,
      {
        kind: "artifact",
        fileName: "release.zip",
        mimeType: "application/zip",
        sizeBytes: content.byteLength,
      },
    );
    await controller.uploadContent(
      "app-1",
      created.uploadId,
      owner.employeeId,
      owner.sessionId,
      owner,
      content,
    );
    const completed = await controller.completeUpload(
      "app-1",
      created.uploadId,
      owner.employeeId,
      owner.sessionId,
      owner,
      {}, // 未提供签名
    );

    expect(completed.uploadStatus).toBe("completed");
    expect(completed.scanStatus).toBe("passed");
    const record = repository.uploads.get(created.uploadId)!;
    expect(record.signed).toBe(false);
    expect(record.signature).toBeNull();

    const upload = repository.uploads.get(created.uploadId)!;
    const input = {
      version: "1.0.0",
      changelog: "Initial release",
      artifactKey: upload.objectKey,
      artifactSha256: upload.sha256!,
      artifactSignature: "",
      scanStatus: "passed" as const,
    };
    await expect(
      service.createVersion(owner, application.applicationId, input),
    ).rejects.toThrow("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
    await expect(
      service.createVersion(owner, application.applicationId, {
        ...input,
        acceptUnsigned: true,
      }),
    ).resolves.toBeDefined();
  });

  it("completes signed artifacts with signed=true and allows version creation", async () => {
    const { repository, controller, service } = makeHarness();
    const application: ApplicationRecord = {
      applicationId: "app-2",
      ownerEmployeeId: owner.employeeId,
      maintainerEmployeeId: owner.employeeId,
      departmentId: "dept-rnd",
      name: "App",
      summary: "App",
      status: "draft",
      currentVersionId: null,
      pendingVersionId: null,
    };
    repository.applications.set(application.applicationId, application);

    const created = await controller.createUpload(
      "app-2",
      owner.employeeId,
      owner.sessionId,
      owner,
      {
        kind: "artifact",
        fileName: "release.zip",
        mimeType: "application/zip",
        sizeBytes: content.byteLength,
      },
    );
    await controller.uploadContent(
      "app-2",
      created.uploadId,
      owner.employeeId,
      owner.sessionId,
      owner,
      content,
    );
    await controller.completeUpload(
      "app-2",
      created.uploadId,
      owner.employeeId,
      owner.sessionId,
      owner,
      { signature: "client-signed" },
    );

    const record = repository.uploads.get(created.uploadId)!;
    expect(record.signed).toBe(true);
    expect(record.signature).toBe("client-signed");

    const input = {
      version: "1.0.0",
      changelog: "Initial release",
      artifactKey: record.objectKey,
      artifactSha256: record.sha256!,
      artifactSignature: "client-signed",
      scanStatus: "passed" as const,
    };
    await expect(
      service.createVersion(owner, application.applicationId, input),
    ).resolves.toBeDefined();
  });
});

describe("PortalApplicationUploadController", () => {
  it("returns a storage-safe DTO and the real assetId", async () => {
    const { repository, portalController } = makeHarness();
    repository.applications.set("app-portal", {
      applicationId: "app-portal",
      ownerEmployeeId: owner.employeeId,
      maintainerEmployeeId: owner.employeeId,
      departmentId: "dept-rnd",
      name: "Portal App",
      summary: "Portal App",
      status: "draft",
      currentVersionId: null,
      pendingVersionId: null,
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const created = await portalController.createUpload(owner, "app-portal", {
      kind: "icon",
      fileName: "icon.png",
      mimeType: "image/png",
      sizeBytes: png.byteLength,
    });
    await portalController.uploadContent(
      owner,
      "app-portal",
      created.uploadId,
      png,
    );
    const completed = await portalController.completeUpload(
      owner,
      "app-portal",
      created.uploadId,
      {},
    );

    expect(completed.assetId).toBeTruthy();
    expect(completed).not.toHaveProperty("objectKey");
    const state = await portalController.getUpload(
      owner,
      "app-portal",
      created.uploadId,
    );
    expect(state.assetId).toBe(completed.assetId);
  });
});
