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
  return {
    mockApp,
    mockVersion,
    settled,
    useApplication: vi.fn((): Query => ({ ...settled, data: mockApp })),
    useApplicationReviews: vi.fn((): Query => ({ ...settled, data: [] })),
    useApplicationVersions: vi.fn((): Query => ({ ...settled, data: [mockVersion] })),
  };
});

vi.mock("../../modules/application/useApplication", () => ({
  useApplication: hoisted.useApplication,
  useApplicationVersions: hoisted.useApplicationVersions,
  useApplicationReviews: hoisted.useApplicationReviews,
}));

const messageMocks = vi.hoisted(() => ({
  showSuccessMessage: vi.fn(),
  showWarningMessage: vi.fn(),
}));

vi.mock("../../shared/ui/message", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/ui/message")>();
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
    messageMocks.showSuccessMessage.mockClear();
    messageMocks.showWarningMessage.mockClear();
  });

  it("renders the workbench heading and all section cards", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "审核工作台" }),
    ).toBeInTheDocument();
    expect(screen.getByText("审核任务信息")).toBeInTheDocument();
    expect(screen.getAllByText("自动校验报告").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("审核操作")).toBeInTheDocument();
    expect(screen.getByText("审核意见记录")).toBeInTheDocument();
  });

  it("renders fallback review history when no backend reviews exist", () => {
    renderPage();

    // enrichReviews 在没有真实审核记录时返回设计稿占位示例
    expect(screen.getByText(/建议通过审核并上线/)).toBeInTheDocument();
    expect(screen.getByText("补充说明")).toBeInTheDocument();
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

  it("triggers a success message when approving", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "通过审核" }));

    expect(messageMocks.showSuccessMessage).toHaveBeenCalledWith(
      "已通过审核（只读预览）",
    );
  });

  it("warns and blocks rejection when the reason is empty", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "驳回" }));

    expect(messageMocks.showWarningMessage).toHaveBeenCalledWith(
      "请输入驳回原因",
    );
    expect(messageMocks.showSuccessMessage).not.toHaveBeenCalled();
  });

  it("records the rejection reason when provided", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("驳回原因"), {
      target: { value: "缺少必要的风险评估材料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "驳回" }));

    expect(messageMocks.showSuccessMessage).toHaveBeenCalledWith(
      "已驳回并记录原因（只读预览）",
    );
  });
});
