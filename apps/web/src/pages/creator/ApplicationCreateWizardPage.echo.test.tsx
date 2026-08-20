import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { render, screen, waitFor } from "@testing-library/react";
import { Controller } from "react-hook-form";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ApplicationCreateWizardPage from "./ApplicationCreateWizardPage";
import { FormWizard } from "../../shared/forms/FormWizard";
import { RichTextEditor } from "../../shared/ui/RichTextEditor";

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

let draftRecord: {
  applicationId: string;
  ownerEmployeeId: string;
  status: string;
  updatedAt: string;
  draft: import("@ai-hub/contracts").ApplicationDraft;
} = {
  applicationId: "app-001",
  ownerEmployeeId: "E0001",
  status: "draft",
  updatedAt: "2026-08-17T00:00:00.000Z",
  draft: {
    name: "回显应用",
    departmentId: "dept-1",
    maintainerEmployeeIds: [] as string[],
    categoryId: "cat-1",
    applicationType: "web_app",
    tagIds: [] as string[],
    icon: {
      backgroundColor: "#185FA5",
      mode: "auto",
      text: "",
      assetId: null,
    },
    screenshotAssetIds: [] as string[],
    summaryHtml: "<p>简介回显内容</p>",
    manualHtml: "<p>手册回显内容</p>",
    manualAssetId: null,
    examplesHtml: "<p>示例回显内容</p>",
    examplesAssetId: null,
    faq: [],
    audience: [
      {
        audienceType: "all",
        departmentId: null,
        employeeId: null,
        includeChildren: false,
      },
    ],
    risk: {
      affectsHighRiskDecisions: false,
      handlesSensitiveData: false,
      inputRestrictionDisclaimer: "免责声明",
      modelProviders: [],
      providerNote: null,
      retainsConversations: false,
      retentionPeriod: null,
      sendsDataExternally: false,
    },
    deliveries: [],
    version: "1.0.0",
    changelog: "初始版本",
  },
};

vi.mock("../../modules/publishing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/publishing")>();
  return {
    ...actual,
    getApplicationDraft: vi.fn(async () => draftRecord),
  };
});

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

describe("编辑回显", () => {
  it("RichTextEditor 响应 value 变化", () => {
    const { rerender } = render(
      <RichTextEditor onChange={() => {}} value="" />,
    );
    rerender(<RichTextEditor onChange={() => {}} value="<p>hello</p>" />);
    const editor = document.querySelector('[contenteditable="true"]');
    expect(editor?.innerHTML).toBe("<p>hello</p>");
  });

  it("FormWizard 重置后富文本字段回显", async () => {
    const steps = [
      {
        fields: ["summaryHtml"],
        key: "content",
        title: "内容",
        render: (form: { control: import("react-hook-form").Control }) => (
          <Controller
            control={form.control}
            name="summaryHtml"
            render={({ field }) => (
              <RichTextEditor
                onChange={field.onChange}
                value={field.value ?? ""}
              />
            )}
          />
        ),
      },
    ];
    const { rerender } = render(
      <FormWizard
        defaultValues={{ summaryHtml: "" }}
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn()}
        steps={steps}
      />,
    );
    rerender(
      <FormWizard
        defaultValues={{ summaryHtml: "<p>loaded-content</p>" }}
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn()}
        steps={steps}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[contenteditable="true"]')?.innerHTML,
      ).toContain("loaded-content");
    });
  });

  it("内容步骤富文本回显草稿内容", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue("回显应用")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.querySelectorAll('[contenteditable="true"]').length).toBe(
        3,
      );
    });
    await waitFor(() => {
      const html = Array.from(
        document.querySelectorAll('[contenteditable="true"]'),
      )
        .map((element) => element.innerHTML)
        .join("|");
      expect(html).toContain("简介回显内容");
      expect(html).toContain("手册回显内容");
      expect(html).toContain("示例回显内容");
    });
  });

  it("自定义分类/标签回显：customCategoryName 映射回分类表单值、customTagNames 并入标签", async () => {
    draftRecord = {
      ...draftRecord,
      draft: {
        ...draftRecord.draft,
        categoryId: "",
        customCategoryName: "自定义分类",
        tagIds: ["tag-1"],
        customTagNames: ["新标签A", " 新标签B "],
      },
    };
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue("回显应用")).toBeInTheDocument();
    });
    await waitFor(() => {
      // 分类 tags 选择器回显自定义分类名；标签选择器回显现有 id 与自定义名（trim 后）。
      // 预览步常驻挂载也会渲染同名文本，因此用 getAllByText 断言存在。
      expect(screen.getAllByText("自定义分类").length).toBeGreaterThan(0);
      expect(screen.getAllByText("tag-1").length).toBeGreaterThan(0);
      expect(screen.getAllByText("新标签A").length).toBeGreaterThan(0);
      expect(screen.getAllByText("新标签B").length).toBeGreaterThan(0);
    });
  });
});
