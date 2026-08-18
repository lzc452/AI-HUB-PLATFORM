import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationDetailsPage from "./ApplicationDetailsPage";

const settled = { isError: false, isPending: false };

const hoisted = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({
    actor: { employeeId: "E0001" },
    canAccess: () => true,
  })),
  useApplication: vi.fn(() => ({
    ...settled,
    data: {
      applicationId: "app-001",
      currentVersionId: "ver-1",
      name: "OCR 票据识别",
      ownerEmployeeId: "E0001",
      status: "published",
      summary: "识别票据",
    },
  })),
  useApplicationWorkspace: vi.fn(() => ({
    ...settled,
    data: {
      application: { applicationId: "app-001", name: "OCR 票据识别" },
      assets: [],
      deliveries: [],
      maintainerName: "王芳",
      ownerName: "李小龙",
      reviews: [],
      reviewQueue: null,
      updatedAt: "2026-08-17T10:00:00.000Z",
      versions: [],
    },
  })),
  useAssetImage: vi.fn(() => ({ objectUrl: null, failed: false })),
  useArchiveApplication: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useTransferApplicationOwner: vi.fn(() => ({
    isPending: false,
    mutate: vi.fn(),
  })),
  useWithdrawApplication: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useCreatorApplications: vi.fn(() => ({
    ...settled,
    data: {
      items: [{ applicationId: "app-001", categoryId: "cat-1", tagIds: [] }],
    },
  })),
  usePublishedVersion: vi.fn(() => ({
    ...settled,
    data: {
      artifactSha256: "abc",
      artifactSignature: null,
      changelog: "",
      createdAt: "2026-08-17T10:00:00.000Z",
      scanStatus: "passed",
      version: "v1.0.0",
    },
  })),
  getApplicationDraft: vi.fn(),
  listDepartments: vi.fn(() =>
    Promise.resolve([{ departmentId: "dept-rnd", name: "研发部" }]),
  ),
  listDepartmentMembers: vi.fn(() =>
    Promise.resolve([
      { employeeId: "E100", displayName: "张三" },
      { employeeId: "E200", displayName: "李四" },
    ]),
  ),
  listCategories: vi.fn(() =>
    Promise.resolve([{ categoryId: "cat-1", name: "效率工具" }]),
  ),
  listTags: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../modules/auth/useAuth", () => ({
  useAuth: hoisted.useAuth,
}));

vi.mock("../../modules/application/useApplication", () => ({
  useApplication: hoisted.useApplication,
  useApplicationWorkspace: hoisted.useApplicationWorkspace,
  useArchiveApplication: hoisted.useArchiveApplication,
  useAssetImage: hoisted.useAssetImage,
  useCreatorApplications: hoisted.useCreatorApplications,
  usePublishedVersion: hoisted.usePublishedVersion,
  useTransferApplicationOwner: hoisted.useTransferApplicationOwner,
  useWithdrawApplication: hoisted.useWithdrawApplication,
}));

vi.mock("../../modules/auth/auth.client", () => ({
  listDepartments: hoisted.listDepartments,
  listDepartmentMembers: hoisted.listDepartmentMembers,
}));

vi.mock("../../modules/publishing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/publishing")>();
  return {
    ...actual,
    getApplicationDraft: hoisted.getApplicationDraft,
  };
});

vi.mock(
  "../../modules/publishing/publishing.client",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../modules/publishing/publishing.client")
      >();
    return {
      ...actual,
      listCategories: hoisted.listCategories,
      listTags: hoisted.listTags,
    };
  },
);

const draftRecord = {
  applicationId: "app-001",
  ownerEmployeeId: "E0001",
  status: "draft",
  updatedAt: "2026-08-18T00:00:00.000Z",
  draft: {
    name: "OCR 票据识别",
    departmentId: "dept-rnd",
    maintainerEmployeeIds: ["E0001"],
    categoryId: "cat-1",
    applicationType: "web_app",
    tagIds: [],
    icon: { mode: "auto", backgroundColor: "#185FA5", text: "", assetId: null },
    screenshotAssetIds: [],
    summaryHtml: "<p>简介</p>",
    manualHtml: "<p>手册</p>",
    examplesHtml: "<p>示例</p>",
    faq: [],
    audience: [
      {
        audienceType: "all",
        departmentId: null,
        employeeId: null,
        includeChildren: false,
      },
      {
        audienceType: "department",
        departmentId: "dept-rnd",
        employeeId: null,
        includeChildren: true,
      },
      {
        audienceType: "employee",
        departmentId: null,
        employeeId: "E100",
        includeChildren: false,
      },
    ],
    risk: {
      affectsHighRiskDecisions: false,
      handlesSensitiveData: false,
      inputRestrictionDisclaimer: "免责声明",
      modelProviders: ["local"],
      providerNote: null,
      retainsConversations: false,
      retentionPeriod: null,
      sendsDataExternally: false,
    },
    deliveries: [],
    version: "1.0.0",
    changelog: "首次发布",
  },
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/applications/app-001"]}>
        <Routes>
          <Route
            path="/applications/:applicationId"
            element={<ApplicationDetailsPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ApplicationDetailsPage 受众标签", () => {
  beforeEach(() => {
    hoisted.getApplicationDraft.mockReset();
    hoisted.getApplicationDraft.mockResolvedValue(draftRecord);
  });

  it("遍历多条受众规则渲染：全体员工 + 部门（含子部门）+ 员工", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/受众范围/)).toBeInTheDocument();
    });
    // 单行合并展示：all → 全体员工；department → 研发部（含子部门）；employee → 张三
    // 员工姓名经异步成员查询解析，等待回显完成。
    await waitFor(() => {
      expect(
        screen.getByText("全体员工、研发部（含子部门）、张三"),
      ).toBeInTheDocument();
    });
  });

  it("无受众数据时显示后端判定兜底文案", async () => {
    hoisted.getApplicationDraft.mockResolvedValue({
      ...draftRecord,
      draft: { ...draftRecord.draft, audience: [] },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("由后端受众策略判定")).toBeInTheDocument();
    });
  });
});
