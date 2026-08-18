import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { render, waitFor } from "@testing-library/react";
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

describe("提交审核状态门禁", () => {
  beforeEach(() => {
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
