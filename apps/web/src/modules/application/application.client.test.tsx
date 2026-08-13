import { beforeEach, describe, expect, it, vi } from "vitest";

import { setSession } from "../auth/session.store";
import { uploadArtifactContent } from "./application.client";

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
    setSession({ employeeId: "E-UPLOAD", sessionId: "session-upload" });
    request = new XMLHttpRequestStub();
    vi.stubGlobal(
      "XMLHttpRequest",
      vi.fn(() => request),
    );
  });

  it("使用当前登录会话上传制品内容", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "release.zip");
    const result = await uploadArtifactContent("app-1", "upload-1", file);

    expect(request.headers.get("x-employee-id")).toBe("E-UPLOAD");
    expect(request.headers.get("x-session-id")).toBe("session-upload");
    expect(request.sentContent).toBe(file);
    expect(result.uploadId).toBe("upload-1");
  });
});
