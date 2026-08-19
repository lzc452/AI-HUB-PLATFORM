import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ApplicationRecord,
  ApplicationVersionRecord,
  ApplicationWorkspace,
  VersionDiff,
  VersionSnapshot,
} from "../../modules/application/application.client";
import { ApiError } from "../../shared/api/client";
import ApplicationVersionsPage from "./ApplicationVersionsPage";

const hoisted = vi.hoisted(() => {
  const application: ApplicationRecord = {
    applicationId: "app-001",
    currentVersionId: "version-new",
    departmentId: "dept-1",
    maintainerEmployeeId: "E0002",
    name: "票据识别助手",
    ownerEmployeeId: "E0001",
    status: "published",
    summary: "用于验证版本快照与差异渲染",
  };
  const versionNew: ApplicationVersionRecord = {
    applicationId: "app-001",
    applicationVersionId: "version-new",
    artifactKey: "applications/app-001/artifacts/v2",
    artifactSha256: "b".repeat(64),
    artifactSignature: "signature-2",
    changelog: "优化发票识别模型，新增增值税电子发票支持。",
    createdAt: "2026-08-12T08:00:00.000Z",
    createdByEmployeeId: "E0001",
    scanStatus: "passed",
    signed: true,
    version: "2.0.0",
  };
  const versionOld: ApplicationVersionRecord = {
    applicationId: "app-001",
    applicationVersionId: "version-old",
    artifactKey: "applications/app-001/artifacts/v1",
    artifactSha256: "a".repeat(64),
    artifactSignature: "signature-1",
    changelog: "首次发布，支持增值税发票识别。",
    createdAt: "2026-07-01T08:00:00.000Z",
    createdByEmployeeId: "E0001",
    scanStatus: "passed",
    signed: true,
    version: "1.0.0",
  };
  const versions: ApplicationVersionRecord[] = [versionNew, versionOld];
  const workspace: ApplicationWorkspace = {
    application,
    applicationType: "web_app",
    assets: [],
    deliveries: [],
    departmentName: "研发部",
    maintainerName: "E0002",
    ownerName: "E0001",
    reviewQueue: null,
    reviews: [],
    updatedAt: "2026-08-12T08:00:00.000Z",
    versions,
  };
  const snapshot: VersionSnapshot = {
    createdAt: "2026-08-12T08:00:00.000Z",
    payload: {
      name: "票据识别助手",
      version: "2.0.0",
      changelog: "优化发票识别模型，新增增值税电子发票支持。",
      tagIds: ["发票", "OCR"],
    },
  };
  const diff: VersionDiff = {
    changed: [
      { field: "name", from: "票据识别助手", to: "票据识别助手 Pro" },
      {
        field: "tagIds",
        from: ["发票", "OCR"],
        to: ["发票", "电子发票", "OCR"],
      },
    ],
    added: [{ field: "newField", value: 42 }],
    removed: [{ field: "legacy", value: true }],
  };
  return {
    application,
    diff,
    snapshot,
    useApplicationVersions: vi.fn(() => ({
      data: versions,
      error: null,
      isError: false,
      isPending: false,
    })),
    usePublishedVersion: vi.fn(() => ({
      data: versionNew,
      error: null,
      isError: false,
      isPending: false,
    })),
    useVersionSnapshot: vi.fn(),
    useVersionDiff: vi.fn(),
    versionNew,
    versionOld,
    versions,
    workspace,
  };
});

vi.mock("../../modules/application/useApplication", () => ({
  useApplication: () => ({
    data: hoisted.application,
    error: null,
    isError: false,
    isPending: false,
  }),
  useApplicationWorkspace: () => ({
    data: hoisted.workspace,
    error: null,
    isError: false,
    isPending: false,
  }),
  useApplicationVersions: hoisted.useApplicationVersions,
  usePublishedVersion: hoisted.usePublishedVersion,
  useVersionSnapshot: hoisted.useVersionSnapshot,
  useVersionDiff: hoisted.useVersionDiff,
  useAssets: () => ({
    query: { data: [], error: null, isError: false, isPending: false },
    remove: { isPending: false, mutate: vi.fn() },
  }),
  useArtifactUpload: () => ({
    complete: { isPending: false, mutateAsync: vi.fn() },
    start: { isPending: false, mutateAsync: vi.fn() },
  }),
  useArtifactUploadStatus: () => ({ data: undefined }),
  useCreateVersion: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useAssetImage: () => ({ objectUrl: null, failed: false }),
  useWithdrawApplication: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
  useArchiveApplication: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
  useTransferApplicationOwner: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("../../modules/auth/useAuth", () => ({
  useAuth: () => ({
    actor: { employeeId: "E0001" },
    canAccess: () => true,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/applications/app-001/versions"]}>
      <Routes>
        <Route
          element={<ApplicationVersionsPage />}
          path="/applications/:applicationId/versions"
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ApplicationVersionsPage", () => {
  beforeEach(() => {
    resetDefaults();
    hoisted.useVersionSnapshot.mockReturnValue({
      data: hoisted.snapshot,
      error: null,
      isError: false,
      isPending: false,
    });
    hoisted.useVersionDiff.mockReturnValue({
      data: hoisted.diff,
      error: null,
      isError: false,
      isPending: false,
    });
  });

  afterEach(() => {
    hoisted.useApplicationVersions.mockReset();
    hoisted.usePublishedVersion.mockReset();
    hoisted.useVersionSnapshot.mockReset();
    hoisted.useVersionDiff.mockReset();
  });

  function resetDefaults() {
    hoisted.useApplicationVersions.mockReturnValue({
      data: hoisted.versions,
      error: null,
      isError: false,
      isPending: false,
    });
    hoisted.usePublishedVersion.mockReturnValue({
      data: hoisted.versionNew,
      error: null,
      isError: false,
      isPending: false,
    });
  }

  it("renders real version records without hardcoded demo content", async () => {
    renderPage();

    expect((await screen.findAllByText("v2.0.0")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("v1.0.0").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("优化发票识别模型，新增增值税电子发票支持。").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("首次发布，支持增值税发票识别。")).toBeTruthy();
    // 硬编码演示数据不再出现
    expect(screen.queryByText("工单 #WORK20260801001")).toBeNull();
    expect(screen.queryByText("王芳")).toBeNull();
    expect(screen.queryByText("ocr-app-2.4.1.apk (72.1 MB)")).toBeNull();
  });

  it("scanStatus 以「校验」语义展示中文标签（非发布/审核状态）", async () => {
    hoisted.useApplicationVersions.mockReturnValue({
      data: [
        { ...hoisted.versionNew, scanStatus: "passed" },
        {
          ...hoisted.versionOld,
          scanStatus: "pending",
          version: "1.1.0",
          changelog: "等待制品扫描",
        },
        {
          ...hoisted.versionOld,
          scanStatus: "failed",
          applicationVersionId: "version-bad",
          version: "1.0.0",
          changelog: "制品校验失败",
        },
      ],
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(await screen.findByText("校验通过")).toBeTruthy();
    expect(screen.getByText("校验中")).toBeTruthy();
    expect(screen.getByText("校验失败")).toBeTruthy();
    // 版本条目标签不再把扫描状态误标为发布 / 审核状态。
    // （版本选择器下拉也含 "v1.1.0" 文本，用 strong 选择器限定时间轴条目标题。）
    const pendingEntry = screen
      .getByText("v1.1.0", { selector: "strong" })
      .closest("button");
    expect(pendingEntry?.textContent).toContain("校验中");
    expect(pendingEntry?.textContent).not.toContain("审核中");
    const failedEntry = screen
      .getByText("v1.0.0", { selector: "strong" })
      .closest("button");
    expect(failedEntry?.textContent).toContain("校验失败");
    expect(failedEntry?.textContent).not.toContain("已发布");
  });

  it("enables and runs the real diff API for the two default versions", async () => {
    renderPage();

    // 默认：版本 A = 选中版本（v2.0.0），版本 B = 上一版本（v1.0.0），按钮可用
    const compareButton = await screen.findByRole("button", {
      name: "开始对比",
    });
    expect((compareButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(compareButton);

    // 差异方向归一化为旧 → 新：from = version-old，to = version-new
    await waitFor(() =>
      expect(hoisted.useVersionDiff).toHaveBeenCalledWith(
        "app-001",
        "version-old",
        "version-new",
      ),
    );
    expect(await screen.findByText("变化字段（2）")).toBeTruthy();
    expect(screen.getByText("票据识别助手 Pro")).toBeTruthy();
    expect(screen.getByText("新增字段（1）")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("移除字段（1）")).toBeTruthy();
    expect(screen.getByText("true")).toBeTruthy();
  });

  it("disables the compare button when only one version exists", async () => {
    hoisted.useApplicationVersions.mockReturnValue({
      data: [hoisted.versionNew],
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    const compareButton = await screen.findByRole("button", {
      name: "开始对比",
    });
    expect((compareButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an empty state when the selected version has no snapshot", async () => {
    hoisted.useVersionSnapshot.mockReturnValue({
      data: undefined,
      error: new ApiError(404, "VERSION_SNAPSHOT_NOT_FOUND"),
      isError: true,
      isPending: false,
    });
    renderPage();

    expect(await screen.findByText("该版本无快照记录")).toBeTruthy();
  });

  it("renders the real snapshot content for the selected version", async () => {
    renderPage();

    const snapshotSection = (await screen.findByText("版本快照详情")).closest(
      "section",
    );
    expect(snapshotSection).not.toBeNull();
    expect(
      within(snapshotSection as HTMLElement).getByText(
        /快照时间：2026\/08\/12/,
      ),
    ).toBeTruthy();
    // 顶层字段渲染：标签 + 值
    expect(
      within(snapshotSection as HTMLElement).getByText("应用名称"),
    ).toBeTruthy();
    expect(
      within(snapshotSection as HTMLElement).getByText("票据识别助手"),
    ).toBeTruthy();
    expect(
      within(snapshotSection as HTMLElement).getByText("发布说明"),
    ).toBeTruthy();
    expect(
      within(snapshotSection as HTMLElement).getByText(
        /新增增值税电子发票支持/,
      ),
    ).toBeTruthy();
    expect(
      within(snapshotSection as HTMLElement).getByText("标签"),
    ).toBeTruthy();
    expect(
      within(snapshotSection as HTMLElement).getByText(/"发票","OCR"/),
    ).toBeTruthy();
  });

  it("renders a non-object snapshot payload as raw JSON", async () => {
    hoisted.useVersionSnapshot.mockReturnValue({
      data: {
        createdAt: "2026-08-12T08:00:00.000Z",
        payload: ["a", "b"] as unknown as Record<string, unknown>,
      },
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(await screen.findByText(/"a","b"/)).toBeTruthy();
  });

  it("shows a no-difference state when the two snapshots are identical", async () => {
    hoisted.useVersionDiff.mockReturnValue({
      data: { changed: [], added: [], removed: [] },
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "开始对比" }));
    expect(
      await screen.findByText("两个版本快照内容一致，无差异"),
    ).toBeTruthy();
  });
});
