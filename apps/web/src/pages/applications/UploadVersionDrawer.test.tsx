import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UploadVersionDrawer } from "./UploadVersionDrawer";

const hoisted = vi.hoisted(() => ({
  complete: vi.fn(),
  createVersion: vi.fn(),
  onClose: vi.fn(),
  start: vi.fn(),
  uploadContent: vi.fn(),
}));

vi.mock(
  "../../modules/application/application.client",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../modules/application/application.client")
      >();
    return { ...actual, uploadArtifactContent: hoisted.uploadContent };
  },
);

vi.mock("../../modules/application/useApplication", () => ({
  useApplication: () => ({
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
  }),
  useArtifactUpload: () => ({
    complete: { isPending: false, mutateAsync: hoisted.complete },
    start: { isPending: false, mutateAsync: hoisted.start },
  }),
  useArtifactUploadStatus: () => ({ data: undefined }),
  useCreateVersion: () => ({
    isPending: false,
    mutateAsync: hoisted.createVersion,
  }),
}));

const uploadSession = {
  errorCode: null,
  expiresAt: "2026-08-13T00:00:00.000Z",
  fileName: "release.zip",
  mimeType: "application/zip",
  objectKey: "applications/app-001/uploads/upload-1/content",
  scanStatus: "pending" as const,
  sha256: null,
  sizeBytes: 3,
  uploadId: "upload-1",
  uploadStatus: "uploading" as const,
};

function selectFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("上传输入框不存在");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadVersionDrawer", () => {
  beforeEach(() => {
    hoisted.complete.mockReset();
    hoisted.createVersion.mockReset();
    hoisted.onClose.mockReset();
    hoisted.start.mockReset();
    hoisted.uploadContent.mockReset();
    hoisted.start.mockResolvedValue(uploadSession);
    hoisted.uploadContent.mockResolvedValue(uploadSession);
  });

  it("直接上传 File 且仅在完成扫描后创建版本", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "release.zip", {
      type: "application/zip",
    });
    hoisted.complete.mockResolvedValue({
      ...uploadSession,
      objectKey: "applications/app-001/artifacts/upload-1",
      scanStatus: "passed",
      sha256: "a".repeat(64),
      uploadStatus: "completed",
    });
    hoisted.createVersion.mockResolvedValue({});
    render(
      <UploadVersionDrawer
        applicationId="app-001"
        onClose={hoisted.onClose}
        open
      />,
    );

    selectFile(file);
    fireEvent.click(await screen.findByRole("button", { name: "开始上传" }));

    await waitFor(() =>
      expect(hoisted.uploadContent).toHaveBeenCalledWith(
        "app-001",
        "upload-1",
        file,
        expect.any(Function),
      ),
    );
    fireEvent.change(await screen.findByLabelText("版本号"), {
      target: { value: "2.0.0" },
    });
    fireEvent.change(screen.getByLabelText("变更说明"), {
      target: { value: "发布闭环" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建版本" }));

    await waitFor(() =>
      expect(hoisted.createVersion).toHaveBeenCalledWith({
        artifactKey: "applications/app-001/artifacts/upload-1",
        artifactSha256: "a".repeat(64),
        artifactSignature: "",
        changelog: "发布闭环",
        version: "2.0.0",
      }),
    );
    expect(hoisted.onClose).toHaveBeenCalledOnce();
  });

  it("扫描失败时展示错误且禁止创建版本", async () => {
    hoisted.complete.mockResolvedValue({
      ...uploadSession,
      errorCode: "MALWARE_DETECTED",
      scanStatus: "failed",
      uploadStatus: "failed",
    });
    render(
      <UploadVersionDrawer
        applicationId="app-001"
        onClose={hoisted.onClose}
        open
      />,
    );

    selectFile(new File(["bad"], "bad.zip"));
    fireEvent.click(await screen.findByRole("button", { name: "开始上传" }));

    expect(
      await screen.findByText("扫描失败：检测到恶意文件，请更换制品后重试"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "创建版本" }),
    ).not.toBeInTheDocument();
  });

  it("扫描虽通过但上传未完成时仍禁止创建版本", async () => {
    hoisted.complete.mockResolvedValue({
      ...uploadSession,
      scanStatus: "passed",
      sha256: "a".repeat(64),
      uploadStatus: "uploading",
    });
    render(
      <UploadVersionDrawer
        applicationId="app-001"
        onClose={hoisted.onClose}
        open
      />,
    );

    selectFile(new File(["data"], "pending.zip"));
    fireEvent.click(await screen.findByRole("button", { name: "开始上传" }));

    await screen.findByText("上传状态：uploading");
    expect(
      screen.queryByRole("button", { name: "创建版本" }),
    ).not.toBeInTheDocument();
  });
});
