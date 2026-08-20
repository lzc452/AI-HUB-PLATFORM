import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationCreateWizardPage from "./ApplicationCreateWizardPage";
import { applicationDraftDefaults } from "../../modules/publishing";

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
  useDepartmentMembers: () => ({
    data: [],
    error: null,
    isError: false,
    isPending: false,
  }),
}));

const mocks = vi.hoisted(() => ({
  getApplicationDraft: vi.fn(),
  saveApplicationDraft: vi.fn(),
  submitApplicationDraft: vi.fn(),
  formWizardProps: null as Record<string, unknown> | null,
}));

vi.mock("../../modules/publishing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/publishing")>();
  return {
    ...actual,
    listCategories: vi.fn(async () => [
      { categoryId: "cat-1", name: "效率工具" },
      { categoryId: "cat-2", name: "数据分析" },
    ]),
    listTags: vi.fn(async () => [
      { tagId: "tag-1", name: "效率" },
      { tagId: "tag-2", name: "助手" },
    ]),
    getApplicationDraft: mocks.getApplicationDraft,
    saveApplicationDraft: mocks.saveApplicationDraft,
    submitApplicationDraft: mocks.submitApplicationDraft,
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
    name: "拆分应用",
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

describe("提交/存草稿时拆分自定义分类/标签（功能 5b）", () => {
  beforeEach(() => {
    mocks.getApplicationDraft.mockReset();
    mocks.saveApplicationDraft.mockReset();
    mocks.submitApplicationDraft.mockReset();
    mocks.formWizardProps = null;
  });

  it("自定义名称与现有 id 混合时：id 走 categoryId/tagIds，新名称走 custom 字段", async () => {
    mocks.getApplicationDraft.mockResolvedValue({
      ...recordBase,
      status: "draft",
    });
    mocks.saveApplicationDraft.mockResolvedValue({});
    mocks.submitApplicationDraft.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());

    const onSubmit = (
      mocks.formWizardProps as {
        onSubmit: (values: unknown) => Promise<void>;
      }
    ).onSubmit;
    await onSubmit({
      ...applicationDraftDefaults,
      categoryId: "我的分类",
      tagIds: ["tag-1", "新标签"],
      deliveryChannels: ["web"],
    });

    expect(mocks.saveApplicationDraft).toHaveBeenCalledWith(
      "app-001",
      expect.objectContaining({
        categoryId: "",
        customCategoryName: "我的分类",
        tagIds: ["tag-1"],
        customTagNames: ["新标签"],
      }),
    );
    expect(mocks.submitApplicationDraft).toHaveBeenCalledWith("app-001");
  });

  it("全部使用现有分类/标签时：不带 custom 字段", async () => {
    mocks.getApplicationDraft.mockResolvedValue({
      ...recordBase,
      status: "draft",
    });
    mocks.saveApplicationDraft.mockResolvedValue({});
    mocks.submitApplicationDraft.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());

    const onSubmit = (
      mocks.formWizardProps as {
        onSubmit: (values: unknown) => Promise<void>;
      }
    ).onSubmit;
    await onSubmit({
      ...applicationDraftDefaults,
      categoryId: "cat-1",
      tagIds: ["tag-1", "tag-2"],
      deliveryChannels: ["web"],
    });

    const payload = mocks.saveApplicationDraft.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(payload.categoryId).toBe("cat-1");
    expect(payload.tagIds).toEqual(["tag-1", "tag-2"]);
    expect(payload).not.toHaveProperty("customCategoryName");
    expect(payload).not.toHaveProperty("customTagNames");
  });

  it("存草稿同样拆分：自定义标签名写入 customTagNames", async () => {
    mocks.getApplicationDraft.mockResolvedValue({
      ...recordBase,
      status: "draft",
    });
    mocks.saveApplicationDraft.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(mocks.formWizardProps).not.toBeNull());

    const onSaveDraft = (
      mocks.formWizardProps as {
        onSaveDraft: (values: unknown) => Promise<void>;
      }
    ).onSaveDraft;
    await onSaveDraft({
      ...applicationDraftDefaults,
      categoryId: "cat-1",
      tagIds: ["新标签"],
      deliveryChannels: [],
    });

    expect(mocks.saveApplicationDraft).toHaveBeenCalledWith(
      "app-001",
      expect.objectContaining({
        categoryId: "cat-1",
        tagIds: [],
        customTagNames: ["新标签"],
      }),
    );
    expect(mocks.submitApplicationDraft).not.toHaveBeenCalled();
  });
});
