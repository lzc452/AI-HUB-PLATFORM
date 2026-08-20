import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  createApplicationDraft: vi.fn(),
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
    createApplicationDraft: mocks.createApplicationDraft,
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
    name: "回显应用",
    applicationType: "web_app",
    deliveries: [],
  },
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <AntApp>
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={["/creator/create?type=edit&applicationId=app-001"]}
        >
          <ApplicationCreateWizardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AntApp>,
  );
}

/** 新增模式（无 applicationId）：草稿惰性创建的行为锚点。 */
function renderPageAddMode() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <AntApp>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/creator/create"]}>
          <ApplicationCreateWizardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AntApp>,
  );
}

describe("提交审核状态门禁", () => {
  beforeEach(() => {
    mocks.createApplicationDraft.mockReset();
    mocks.createApplicationDraft.mockResolvedValue({
      applicationId: "app-new-1",
    });
    mocks.getApplicationDraft.mockReset();
    mocks.submitApplicationDraft.mockClear();
    mocks.saveApplicationDraft.mockClear();
    mocks.formWizardProps = null;
  });

  it("in_review 应用禁用提交按钮，且不调用后端提交接口", async () => {
    mocks.getApplicationDraft.mockResolvedValue({
      ...recordBase,
      status: "in_review",
    });
    renderPage();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());
    expect(mocks.formWizardProps?.submitDisabled).toBe(true);

    // 即使提交回调被直接触发（绕过按钮），也应拦截而非调用后端。
    const onSubmit = (
      mocks.formWizardProps as {
        onSubmit: (values: unknown) => Promise<void>;
      }
    ).onSubmit;
    await onSubmit({});
    expect(mocks.submitApplicationDraft).not.toHaveBeenCalled();
    expect(mocks.saveApplicationDraft).not.toHaveBeenCalled();
  });

  it("draft 应用保持提交按钮可用", async () => {
    mocks.getApplicationDraft.mockResolvedValue({
      ...recordBase,
      status: "draft",
    });
    renderPage();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());
    expect(mocks.formWizardProps?.submitDisabled).toBe(false);
  });
});

describe("草稿惰性创建", () => {
  beforeEach(() => {
    mocks.createApplicationDraft.mockReset();
    mocks.createApplicationDraft.mockResolvedValue({
      applicationId: "app-new-1",
    });
    mocks.formWizardProps = null;
  });

  it("挂载时不创建草稿；首次下一步校验通过后才创建，且后续复用同一草稿", async () => {
    renderPageAddMode();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());
    expect(mocks.createApplicationDraft).not.toHaveBeenCalled();

    // 模拟 FormWizard「校验通过后」回调 onNextSuccess（本文件将 FormWizard
    // 整体 mock，校验门禁行为由 FormWizard 自身的测试覆盖）。
    const invokeNext = async () => {
      await act(async () => {
        await (
          mocks.formWizardProps as {
            onNextSuccess: () => Promise<void>;
          }
        ).onNextSuccess();
      });
    };

    await invokeNext();
    expect(mocks.createApplicationDraft).toHaveBeenCalledTimes(1);

    // 后续「下一步」复用已创建草稿，不重复创建。
    await invokeNext();
    expect(mocks.createApplicationDraft).toHaveBeenCalledTimes(1);
  });

  it("校验不通过时点下一步不创建草稿", async () => {
    renderPageAddMode();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());
    // 校验不通过时 FormWizard 不会触发 onNextSuccess / onSaveDraft，
    // 页面自身也不得创建草稿（回归锚点：挂载 effect 无条件创建空草稿）。
    expect(mocks.createApplicationDraft).not.toHaveBeenCalled();
  });
});
