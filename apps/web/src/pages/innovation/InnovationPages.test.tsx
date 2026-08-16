import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InnovationDemandDetailPage from "./InnovationDemandDetailPage";
import InnovationSquarePage from "./InnovationSquarePage";

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockLike = vi.fn();
const mockCommentLike = vi.fn();
const mockAddComment = vi.fn();

vi.mock("../../modules/innovation/useDemand", () => ({
  useDemandList: (query: unknown) => {
    mockList(query);
    return {
      data: {
        items: [
          {
            demandId: "d-1",
            title: "内部知识问答助手",
            problemStatement: "知识分散，员工检索资料耗时较长。",
            desiredOutcome: "让员工能在一个入口完成可信检索。",
            status: "published",
            audienceType: "all",
            audienceDepartmentId: null,
            displayAnonymously: true,
            likeCount: 128,
            commentCount: 4,
            priorityScore: 4.6,
            priorityExplanation: null,
            businessValue: 5,
            implementationCost: 2,
            riskLevel: 1,
            adminPriority: 4,
            ownerEmployeeId: null,
            primarySolutionApplicationId: null,
            requesterEmployeeId: null,
            reviewReason: null,
            version: 1,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-02T00:00:00.000Z",
          },
        ],
        page: 1,
        pageSize: 6,
        total: 1,
      },
      isPending: false,
      isError: false,
      error: null,
    };
  },
  useCreateDemandDraft: () => ({ isPending: false, mutateAsync: mockCreate }),
  useUploadDemandAttachment: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDemandAttachments: () => ({ data: [], isPending: false }),
  useDemand: () => ({
    data: {
      demandId: "d-1",
      title: "内部知识问答助手",
      problemStatement: "知识分散，员工检索资料耗时较长。",
      desiredOutcome: "让员工能在一个入口完成可信检索。",
      status: "published",
      audienceType: "all",
      audienceDepartmentId: null,
      displayAnonymously: true,
      likeCount: 128,
      commentCount: 1,
      priorityScore: 4.6,
      priorityExplanation: "价值高、风险可控",
      businessValue: 5,
      implementationCost: 2,
      riskLevel: 1,
      adminPriority: 4,
      ownerEmployeeId: null,
      primarySolutionApplicationId: null,
      requesterEmployeeId: null,
      reviewReason: null,
      version: 1,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    },
    isPending: false,
    isError: false,
    error: null,
  }),
  useDemandComments: () => ({
    data: [
      {
        commentId: "c-1",
        demandId: "d-1",
        parentCommentId: null,
        authorEmployeeId: "e-1",
        authorDisplayName: "林晓",
        authorDepartmentName: "产品技术部",
        body: "建议先接入知识库权限同步。",
        displayAnonymously: false,
        likeCount: 2,
        likedByCurrentActor: false,
        hiddenAt: null,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ],
    isPending: false,
  }),
  useLikeDemand: () => ({ isPending: false, mutate: mockLike }),
  useLikeDemandComment: () => ({ isPending: false, mutate: mockCommentLike }),
  useAddDemandComment: () => ({ isPending: false, mutate: mockAddComment }),
  useReportDemand: () => ({ isPending: false, mutate: vi.fn() }),
  useDemandGovernanceData: () => ({
    collaborators: { data: [] },
    applications: { data: [] },
    pilots: { data: [] },
    reports: { data: [] },
  }),
}));

vi.mock("../../modules/auth/useAuth", () => ({
  useAuth: () => ({
    actor: {
      employeeId: "e-1",
      permissions: [
        "demand.create",
        "demand.read",
        "demand.interact",
        "demand.manage",
      ],
    },
  }),
}));

function renderWithRouter(ui: React.ReactNode, initialEntry = "/innovation") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={ui} path="/innovation" />
          <Route element={ui} path="/innovation/:demandId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Innovation pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("同步 URL 筛选并按整卡进入详情", async () => {
    renderWithRouter(<InnovationSquarePage />);
    expect(
      screen.getByRole("heading", { name: "创新广场" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索需求" }), {
      target: { value: "知识" },
    });
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "搜索需求" }), {
      key: "Enter",
    });
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "查看需求详情" })).toHaveAttribute(
      "href",
      "/innovation/d-1",
    );
  });

  it("详情页支持需求点赞、Emoji、一级回复和评论点赞", () => {
    renderWithRouter(<InnovationDemandDetailPage />, "/innovation/d-1");
    fireEvent.click(screen.getByRole("button", { name: /点赞/ }));
    expect(mockLike).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "添加 Emoji" }));
    fireEvent.click(screen.getByRole("button", { name: "😀" }));
    expect(
      (screen.getByRole("textbox", { name: "讨论内容" }) as HTMLTextAreaElement)
        .value,
    ).toContain("😀");
    fireEvent.click(screen.getByRole("button", { name: /赞同这条评论/ }));
    expect(mockCommentLike).toHaveBeenCalledWith("c-1");
  });
});
