import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Modal } from "antd";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminApplicationRow } from "../../modules/application/adminListMeta";
import ApplicationsPage from "./ApplicationsPage";

const hoisted = vi.hoisted(() => {
  const draftRow: AdminApplicationRow = {
    applicationId: "app-1",
    categoryId: "productivity",
    currentVersion: "v0.1.0",
    currentVersionId: null,
    deliveryChannels: [],
    departmentName: "研发部",
    isMine: true,
    name: "测试草稿",
    needsMyReview: false,
    ownerName: "张三",
    status: "draft",
    summary: "删除确认弹窗回归测试用草稿",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
  const noop = () => {};
  // 可替换的行集合：审核入口权限测试需要 in_review 行。
  const rows: AdminApplicationRow[] = [draftRow];
  // 每次调用返回全新对象引用：真实 hook 每次渲染都会新建返回对象，
  // 使 effect 的 list 依赖在任意重渲染后都“变化”——这是连弹 bug 的触发条件。
  const makeListMock = () => ({
    data: { items: rows, page: 1, pageSize: 10, total: rows.length },
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    keyword: "",
    setKeyword: noop,
    filters: {
      applicationType: "all",
      channel: undefined,
      departmentId: "all",
      mode: "all",
      reset: noop,
      setApplicationType: noop,
      setChannel: noop,
      setDepartmentId: noop,
      setMode: noop,
      setSort: noop,
      setStatus: noop,
      sort: "recent",
      status: "all",
    },
    page: 1,
    pageSize: 10,
    refetch: noop,
    setPage: noop,
    setPageSize: noop,
  });
  // 审核入口权限测试：可替换当前登录 actor 的权限集合。
  const actorPermissions: string[] = ["application.read"];
  return {
    actorPermissions,
    deleteMutate: vi.fn(),
    draftRow,
    makeListMock,
    rows,
  };
});

vi.mock("../../modules/auth/useAuth", () => ({
  useAuth: () => ({
    actor: { permissions: hoisted.actorPermissions },
    session: { employeeId: "E0001" },
  }),
}));

vi.mock("../../modules/application/useAdminApplicationList", () => ({
  useAdminApplicationList: () => hoisted.makeListMock(),
}));

vi.mock("../../modules/application/useAdminKpis", () => ({
  useAdminKpis: () => ({
    data: { deliveryFailed: 0, pendingReview: 0, published: 0, total: 1 },
    error: null,
    isError: false,
    isPending: false,
    refetch: () => {},
  }),
}));

vi.mock("../../modules/application/useApplication", async () => {
  const { useState } = await import("react");
  return {
    useDeleteApplication: () => {
      // 用真实 React 状态模拟 react-query mutation 的 isPending 翻转：
      // mutate 会触发组件重渲染，正是真实环境下连弹 bug 的触发源。
      const [, setFlipped] = useState(false);
      return {
        isPending: false,
        mutate: (applicationId: string) => {
          hoisted.deleteMutate(applicationId);
          setFlipped(true);
        },
      };
    },
  };
});

describe("ApplicationsPage 删除草稿", () => {
  beforeEach(() => {
    hoisted.deleteMutate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("确认删除后仅弹出一次确认框并触发删除", async () => {
    const confirmSpy = vi
      .spyOn(Modal, "confirm")
      .mockReturnValue({ destroy: vi.fn() } as never);

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /删\s*除/ }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    // 触发 onOk（删除分支）：mutation 状态翻转会引发重渲染，断言不再新增弹窗。
    const options = confirmSpy.mock.calls[0]![0];
    await act(async () => {
      await options.onOk!();
    });

    await waitFor(() =>
      expect(hoisted.deleteMutate).toHaveBeenCalledWith("app-1"),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ApplicationsPage 审核入口权限", () => {
  afterEach(() => {
    hoisted.actorPermissions.splice(
      0,
      hoisted.actorPermissions.length,
      "application.read",
    );
    hoisted.rows.splice(0, hoisted.rows.length, hoisted.draftRow);
  });

  it("无 application.review 权限时不显示待审核 KPI、待我审核筛选与审核按钮", () => {
    hoisted.actorPermissions.splice(
      0,
      hoisted.actorPermissions.length,
      "application.read",
    );
    hoisted.rows.splice(0, hoisted.rows.length, {
      ...hoisted.draftRow,
      needsMyReview: true,
      status: "in_review",
    });
    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("待审核")).not.toBeInTheDocument();
    expect(screen.queryByText("待我审核")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "审核 测试草稿" }),
    ).not.toBeInTheDocument();
    // 无权限时 in_review 行仍可查看
    expect(
      screen.getByRole("button", { name: "查看 测试草稿" }),
    ).toBeInTheDocument();
  });

  it("有 application.review 权限时显示审核入口", () => {
    hoisted.actorPermissions.splice(
      0,
      hoisted.actorPermissions.length,
      "application.read",
      "application.review",
    );
    hoisted.rows.splice(0, hoisted.rows.length, {
      ...hoisted.draftRow,
      needsMyReview: true,
      status: "in_review",
    });
    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("待审核").length).toBeGreaterThan(0);
    expect(screen.getByText("待我审核")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "审核 测试草稿" }),
    ).toBeInTheDocument();
  });
});
