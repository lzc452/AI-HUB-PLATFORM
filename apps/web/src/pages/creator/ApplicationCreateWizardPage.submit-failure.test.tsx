import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { message } from "antd";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../shared/api/client";
import ApplicationCreateWizardPage from "./ApplicationCreateWizardPage";

vi.mock("../../modules/auth/useIdentity", () => ({
  useDepartments: () => ({
    data: [],
    error: null,
    isError: false,
    isPending: false,
  }),
  useEmployees: () => ({
    data: [],
    error: null,
    isError: false,
    isPending: false,
  }),
}));

const mocks = vi.hoisted(() => ({
  getApplicationDraft: vi.fn(),
  submitApplicationDraft: vi.fn(),
  saveApplicationDraft: vi.fn(),
  formWizardProps: null as Record<string, unknown> | null,
}));

vi.mock("../../modules/publishing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/publishing")>();
  return {
    ...actual,
    getApplicationDraft: mocks.getApplicationDraft,
    submitApplicationDraft: mocks.submitApplicationDraft,
    saveApplicationDraft: mocks.saveApplicationDraft,
  };
});

vi.mock("../../shared/forms/FormWizard", () => ({
  FormWizard: (props: Record<string, unknown>) => {
    mocks.formWizardProps = props;
    return <div data-testid="form-wizard" />;
  },
}));

const recordBase = {
  applicationId: "app-001",
  ownerEmployeeId: "E0001",
  updatedAt: "2026-08-17T00:00:00.000Z",
  draft: {
    name: "提交失败应用",
    applicationType: "web_app",
    deliveries: [],
  },
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={["/creator/create?type=edit&applicationId=app-001"]}
      >
        <ApplicationCreateWizardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("提交审核失败提示", () => {
  beforeEach(() => {
    mocks.getApplicationDraft.mockReset();
    mocks.submitApplicationDraft.mockReset();
    mocks.saveApplicationDraft.mockReset();
    mocks.formWizardProps = null;
  });

  afterEach(() => {
    // 清掉全局 message 通知，避免其 3 秒自动关闭定时器在环境销毁后触发更新。
    message.destroy();
  });

  it("校验失败（400 + issues）时展示问题清单", async () => {
    mocks.getApplicationDraft.mockResolvedValue({
      ...recordBase,
      status: "draft",
    });
    mocks.saveApplicationDraft.mockResolvedValue({});
    mocks.submitApplicationDraft.mockRejectedValue(
      new ApiError(
        400,
        "DRAFT_VALIDATION_FAILED",
        "草稿未通过提交校验",
        "trace-b2",
        [
          { code: "DELIVERY_TARGETS_INCOMPLETE", message: "交付目标不完整" },
          { code: "MANUAL_HTML_REQUIRED", message: "手册内容为空" },
        ],
      ),
    );
    renderPage();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());

    const onSubmit = (
      mocks.formWizardProps as {
        onSubmit: (values: unknown) => Promise<void>;
      }
    ).onSubmit;
    await onSubmit({});

    await waitFor(() => {
      expect(document.body.textContent).toContain("草稿未通过提交校验");
      expect(document.body.textContent).toContain("交付目标不完整");
      expect(document.body.textContent).toContain("手册内容为空");
      expect(document.body.textContent).toContain("trace-b2");
    });
    // 失败后不跳转详情页。
    expect(globalThis.location.pathname).toBe("/");
  });

  it("网络/未知错误时展示通用提交失败提示", async () => {
    mocks.getApplicationDraft.mockResolvedValue({
      ...recordBase,
      status: "draft",
    });
    mocks.saveApplicationDraft.mockResolvedValue({});
    mocks.submitApplicationDraft.mockRejectedValue(
      new ApiError(0, "NETWORK_ERROR", "网络请求失败"),
    );
    renderPage();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());

    const onSubmit = (
      mocks.formWizardProps as {
        onSubmit: (values: unknown) => Promise<void>;
      }
    ).onSubmit;
    await onSubmit({});

    await waitFor(() => {
      expect(document.body.textContent).toContain("提交失败：网络请求失败");
    });
  });
});
