import { beforeEach, describe, expect, it, vi } from "vitest";

import { setSession } from "../auth";
import {
  submitApplicationReview,
  uploadArtifactContent,
} from "./application.client";

class XMLHttpRequestStub {
  readonly headers = new Headers();
  readonly upload = {
    onprogress: null as ((event: ProgressEvent) => void) | null,
  };
  status = 200;
  responseText = JSON.stringify({
    uploadId: "upload-1",
    applicationId: "app-1",
    objectKey: "artifacts/app-1/upload-1",
    fileName: "release.zip",
    mimeType: "application/zip",
    sizeBytes: 3,
    uploadStatus: "uploading",
    scanStatus: "pending",
    sha256: null,
    errorCode: null,
    expiresAt: "2026-08-13T00:00:00.000Z",
  });
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentContent: Blob | ArrayBuffer | null = null;

  open() {}

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(content?: Blob | ArrayBuffer) {
    this.sentContent = content ?? null;
    this.onload?.();
  }
}

describe("uploadArtifactContent", () => {
  let request: XMLHttpRequestStub;

  beforeEach(() => {
    setSession({ employeeId: "E-UPLOAD" });
    request = new XMLHttpRequestStub();
    vi.stubGlobal(
      "XMLHttpRequest",
      vi.fn(() => request),
    );
  });

  it("使用当前登录会话上传制品内容", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "release.zip");
    const result = await uploadArtifactContent("app-1", "upload-1", file);

    expect(request.headers.get("x-employee-id")).toBeNull();
    expect(request.headers.get("x-session-id")).toBeNull();
    expect(request.headers.get("x-request-nonce")).not.toBeNull();
    expect(request.sentContent).toBe(file);
    expect(result.uploadId).toBe("upload-1");
  });
});

describe("submitApplicationReview", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => Response.json({ applicationId: "app-1" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("确认接受未签名风险时携带 acceptUnsigned 请求体", async () => {
    await submitApplicationReview("version-1", { acceptUnsigned: true });

    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/internal/applications/versions/version-1/submit-review",
    );
    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      acceptUnsigned: true,
    });
  });

  it("未确认时不携带请求体", async () => {
    await submitApplicationReview("version-1");

    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(options.body).toBeUndefined();
  });
});
