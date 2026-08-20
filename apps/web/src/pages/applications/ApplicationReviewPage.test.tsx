import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationReviewPage from "./ApplicationReviewPage";

const hoisted = vi.hoisted(() => {
  const settled = { isError: false, isPending: false };
  type Query = { isError: boolean; isPending: boolean; data: unknown };
  const mockApp = {
    applicationId: "app-001",
    currentVersionId: "ver-1",
    departmentId: "财务部",
    maintainerEmployeeId: "王芳",
    name: "OCR票据识别",
    ownerEmployeeId: "李小龙",
    status: "in_review",
    summary: "测试应用",
  };
  const mockVersion = {
    applicationId: "app-001",
    applicationVersionId: "ver-1",
    artifactKey: "k",
    artifactSha256: "s",
    artifactSignature: null,
    changelog: "",
    createdAt: "2026-08-01T10:20:00+08:00",
    createdByEmployeeId: "E0001",
    scanStatus: "passed",
    version: "v2.4.1",
  };
  const mockReviewQueue = {
    applicationId: "app-001",
    applicationVersionId: "ver-1",
    claimedByEmployeeId: null,
    claimedAt: null,
    createdAt: "2026-08-01T10:20:00+08:00",
    reviewQueueId: "rq-1",
    slaDueAt: "2026-08-02T10:20:00+08:00",
    slaStatus: "on_time",
    status: "available",
  };
  const mockPendingCatalogItems = [
    {
      createdAt: "2026-08-01T10:20:00+08:00",
      itemId: "pc-1",
      kind: "category",
      name: "财务自动化",
    },
    {
      createdAt: "2026-08-01T10:20:00+08:00",
      itemId: "pc-2",
      kind: "tag",
      name: "AI识别",
    },
  ];
  return {
    mockApp,
    mockVersion,
    mockReviewQueue,
    mockPendingCatalogItems,
    settled,
    useApplication: vi.fn((): Query => ({ ...settled, data: mockApp })),
    useApplicationWorkspace: vi.fn(
      (): Query => ({
        ...settled,
        data: {
          application: mockApp,
          assets: [],
          deliveries: [],
          reviews: [],
          reviewQueue: null,
          versions: [mockVersion],
        },
      }),
    ),
    useAssetImage: vi.fn(() => ({ objectUrl: null, failed: false })),
    useWithdrawApplication: vi.fn(() => ({
      isPending: false,
      mutate: vi.fn(),
    })),
    useArchiveApplication: vi.fn(() => ({
      isPending: false,
      mutate: vi.fn(),
    })),
    useTransferApplicationOwner: vi.fn(() => ({
      isPending: false,
      mutate: vi.fn(),
    })),
    useApplicationReviews: vi.fn((): Query => ({ ...settled, data: [] })),
    useApplicationVersions: vi.fn(
      (): Query => ({ ...settled, data: [mockVersion] }),
    ),
    useReviewQueue: vi.fn((): Query => ({ ...settled, data: mockReviewQueue })),
    useValidationChecks: vi.fn((): Query => ({ ...settled, data: [] })),
    useClaimReview: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
    useReleaseReview: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
    useReviewApplicationVersion: vi.fn(() => ({
      isPending: false,
      mutate: hoisted.reviewMutate,
    })),
    usePendingCatalogItems: vi.fn((): Query => ({ ...settled, data: [] })),
    useDeletePendingCatalogItem: vi.fn(() => ({
      isPending: false,
      mutate: hoisted.deletePendingCatalogItem,
    })),
    deletePendingCatalogItem: vi.fn(),
    reviewMutate: vi.fn(),
    useAuth: vi.fn(() => ({
      actor: { employeeId: "李小龙" },
      canAccess: () => true,
    })),
  };
});

vi.mock("../../modules/auth/useAuth", () => ({
  useAuth: hoisted.useAuth,
}));

vi.mock("../../modules/application/useApplication", () => ({
  useApplication: hoisted.useApplication,
  useApplicationWorkspace: hoisted.useApplicationWorkspace,
  useAssetImage: hoisted.useAssetImage,
  useWithdrawApplication: hoisted.useWithdrawApplication,
  useArchiveApplication: hoisted.useArchiveApplication,
  useTransferApplicationOwner: hoisted.useTransferApplicationOwner,
  useApplicationVersions: hoisted.useApplicationVersions,
  useApplicationReviews: hoisted.useApplicationReviews,
  useReviewQueue: hoisted.useReviewQueue,
  useValidationChecks: hoisted.useValidationChecks,
  useClaimReview: hoisted.useClaimReview,
  useReleaseReview: hoisted.useReleaseReview,
  useReviewApplicationVersion: hoisted.useReviewApplicationVersion,
  usePendingCatalogItems: hoisted.usePendingCatalogItems,
  useDeletePendingCatalogItem: hoisted.useDeletePendingCatalogItem,
}));

const messageMocks = vi.hoisted(() => ({
  showSuccessMessage: vi.fn(),
  showWarningMessage: vi.fn(),
}));

vi.mock("../../shared/ui/message", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../shared/ui/message")>();
  return {
    ...actual,
    showSuccessMessage: messageMocks.showSuccessMessage,
    showWarningMessage: messageMocks.showWarningMessage,
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/applications/app-001/review"]}>
      <Routes>
        <Route
          element={<ApplicationReviewPage />}
          path="/applications/:applicationId/review"
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ApplicationReviewPage", () => {
  beforeEach(() => {
    hoisted.useApplication.mockReturnValue({
      ...hoisted.settled,
      data: hoisted.mockApp,
    });
    hoisted.useApplicationVersions.mockReturnValue({
      ...hoisted.settled,
      data: [hoisted.mockVersion],
    });
    hoisted.useApplicationReviews.mockReturnValue({
      ...hoisted.settled,
      data: [],
    });
    hoisted.useReviewQueue.mockReturnValue({
      ...hoisted.settled,
      data: hoisted.mockReviewQueue,
    });
    hoisted.useValidationChecks.mockReturnValue({
      ...hoisted.settled,
      data: [],
    });
    hoisted.usePendingCatalogItems.mockReturnValue({
      ...hoisted.settled,
      data: [],
    });
    hoisted.deletePendingCatalogItem.mockClear();
    hoisted.reviewMutate.mockClear();
    messageMocks.showSuccessMessage.mockClear();
    messageMocks.showWarningMessage.mockClear();
  });

  it("renders the workbench heading and all section cards", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "审核工作台" }),
    ).toBeInTheDocument();
    expect(screen.getByText("审核任务信息")).toBeInTheDocument();
    expect(screen.getAllByText("自动校验报告").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByText("审核操作")).toBeInTheDocument();
    expect(screen.getByText("审核意见记录")).toBeInTheDocument();
  });

  it("shows empty state when no backend reviews exist", () => {
    renderPage();

    expect(screen.getByText("暂无审核记录")).toBeInTheDocument();
  });

  it("状态标签显示中文而非原始枚举（in_review → 审核中）", () => {
    renderPage();

    expect(screen.getAllByText("审核中").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("in_review")).not.toBeInTheDocument();
  });

  it("shows the loading placeholder while queries are pending", () => {
    hoisted.useApplication.mockReturnValue({
      ...hoisted.settled,
      isPending: true,
      data: undefined,
    });

    renderPage();

    expect(screen.queryByText("审核任务信息")).not.toBeInTheDocument();
  });

  it("submits an approve decision through the review mutation", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "通过审核" }));

    expect(hoisted.reviewMutate).toHaveBeenCalledWith({
      applicationVersionId: "ver-1",
      comment: "",
      decision: "approve",
    });
  });

  it("warns and blocks rejection when the reason is empty", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "驳回" }));

    expect(messageMocks.showWarningMessage).toHaveBeenCalledWith(
      "请输入驳回原因",
    );
    expect(hoisted.reviewMutate).not.toHaveBeenCalled();
  });

  it("submits a rejection decision with the provided reason", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("驳回原因"), {
      target: { value: "缺少必要的风险评估材料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "驳回" }));

    expect(hoisted.reviewMutate).toHaveBeenCalledWith({
      applicationVersionId: "ver-1",
      comment: "缺少必要的风险评估材料",
      decision: "reject",
    });
  });

  it("禁止审核自己提交的应用：所有者视角领取按钮禁用", () => {
    hoisted.useAuth.mockReturnValue({
      actor: { employeeId: "李小龙" },
      canAccess: () => true,
    });
    renderPage();

    expect(screen.getByRole("button", { name: /领\s*取任务/ })).toBeDisabled();
  });

  it("他人提交的应用允许领取任务", () => {
    hoisted.useAuth.mockReturnValue({
      actor: { employeeId: "E900" },
      canAccess: () => true,
    });
    renderPage();

    expect(
      screen.getByRole("button", { name: /领\s*取任务/ }),
    ).not.toBeDisabled();
  });

  it("存在待审自定义分类/标签时渲染卡片，显示类型与名称", () => {
    hoisted.usePendingCatalogItems.mockReturnValue({
      ...hoisted.settled,
      data: hoisted.mockPendingCatalogItems,
    });

    renderPage();

    expect(screen.getByText("自定义分类/标签")).toBeInTheDocument();
    expect(screen.getByText("财务自动化")).toBeInTheDocument();
    expect(screen.getByText("AI识别")).toBeInTheDocument();
    // kind 标签：分类 → 分类，tag → 标签
    expect(screen.getAllByText("分类").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("标签").length).toBeGreaterThanOrEqual(1);
  });

  it("待审列表为空时不渲染自定义分类/标签卡片", () => {
    renderPage();

    expect(screen.queryByText("自定义分类/标签")).not.toBeInTheDocument();
  });

  it("点击删除需经 Popconfirm 确认，确认后调用删除 mutation", async () => {
    hoisted.usePendingCatalogItems.mockReturnValue({
      ...hoisted.settled,
      data: hoisted.mockPendingCatalogItems,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "删除 财务自动化" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));

    expect(hoisted.deletePendingCatalogItem).toHaveBeenCalledWith("pc-1");
  });
});
