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
  // 每次调用返回全新对象引用：真实 hook 每次渲染都会新建返回对象，
  // 使 effect 的 list 依赖在任意重渲染后都“变化”——这是连弹 bug 的触发条件。
  const makeListMock = () => ({
    data: { items: [draftRow], page: 1, pageSize: 10, total: 1 },
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
  return { deleteMutate: vi.fn(), draftRow, makeListMock };
});

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
