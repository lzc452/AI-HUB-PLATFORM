import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import NotificationsPage from "./NotificationsPage";
import type { NotificationRecord } from "../../modules/notification/notification.client";

const mockNotifications: NotificationRecord[] = [
  {
    aggregateId: "app-001",
    createdAt: "2026-08-11T16:55:00+08:00",
    eventType: "application.published",
    idempotencyKey: "k1",
    message: "您的应用「OCR票据识别」审核已通过",
    notificationId: "n1",
    readAt: null,
    recipientEmployeeId: "E001",
  },
  {
    aggregateId: "app-002",
    createdAt: "2026-08-11T16:30:00+08:00",
    eventType: "application.reviewed",
    idempotencyKey: "k2",
    message: "应用「会议纪要总结」收到新的评价",
    notificationId: "n2",
    readAt: "2026-08-11T16:35:00+08:00",
    recipientEmployeeId: "E001",
  },
  {
    aggregateId: "app-003",
    createdAt: "2026-08-11T15:00:00+08:00",
    eventType: "security.scan_alert",
    idempotencyKey: "k3",
    message: "系统扫描发现 1 个高风险附件",
    notificationId: "n3",
    readAt: null,
    recipientEmployeeId: "E001",
  },
];

interface MockNotificationsResult {
  data: NotificationRecord[] | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
}

const hoisted = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllReadMutate: vi.fn(),
  useNotifications: vi.fn(
    (): MockNotificationsResult => ({
      data: mockNotifications,
      error: null,
      isError: false,
      isPending: false,
    }),
  ),
  useMarkAllNotificationsRead: vi.fn(() => ({
    isPending: false,
    mutate: vi.fn(),
  })),
}));

vi.mock("../../modules/notification/useNotification", () => ({
  useNotifications: hoisted.useNotifications,
  useMarkNotificationRead: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useMarkAllNotificationsRead: hoisted.useMarkAllNotificationsRead,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useNotifications.mockReturnValue({
      data: mockNotifications,
      error: null,
      isError: false,
      isPending: false,
    });
  });

  it("renders loading state", () => {
    hoisted.useNotifications.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
    });
    renderPage();

    expect(screen.getByLabelText("通知加载中")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    hoisted.useNotifications.mockReturnValue({
      data: [],
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(screen.getByText("暂无通知")).toBeInTheDocument();
  });

  it("renders notification list with titles and timestamps", () => {
    renderPage();

    // 页面重构为 antd Tabs，无 h1 标题：断言「全部」页签
    expect(screen.getByRole("tab", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "未读" })).toBeInTheDocument();
    expect(
      screen.getByText("您的应用「OCR票据识别」审核已通过"),
    ).toBeInTheDocument();
    // 该条消息同时作为标题与摘要渲染（fallback 分支），用 getAllByText 断言
    expect(
      screen.getAllByText("应用「会议纪要总结」收到新的评价").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("系统扫描发现 1 个高风险附件")).toBeInTheDocument();
    expect(screen.getByText("共 3 条")).toBeInTheDocument();
  });

  it("filters to unread tab", () => {
    renderPage();

    const unreadTab = screen.getByRole("tab", { name: "未读" });
    fireEvent.click(unreadTab);

    expect(
      screen.getByText("您的应用「OCR票据识别」审核已通过"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("应用「会议纪要总结」收到新的评价"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("系统扫描发现 1 个高风险附件")).toBeInTheDocument();
    expect(screen.getByText("共 2 条")).toBeInTheDocument();
  });

  it("opens detail modal when clicking a notification", () => {
    renderPage();

    fireEvent.click(screen.getByText("您的应用「OCR票据识别」审核已通过"));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("您的应用「OCR票据识别」审核已通过"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("审核相关")).toBeInTheDocument();
    expect(within(dialog).getByText("审核信息")).toBeInTheDocument();
    expect(within(dialog).getByText("查看应用详情")).toBeInTheDocument();
  });

  it("marks all notifications as read", () => {
    const mutate = vi.fn();
    hoisted.useMarkAllNotificationsRead.mockReturnValue({
      isPending: false,
      mutate,
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "全部标记已读" }));

    expect(mutate).toHaveBeenCalledWith(["n1", "n3"]);
  });

  it("disables mark-all-read when no unread notifications", () => {
    hoisted.useNotifications.mockReturnValue({
      data: mockNotifications.map((n) => ({
        ...n,
        readAt: "2026-08-11T17:00:00+08:00",
      })),
      error: null,
      isError: false,
      isPending: false,
    });
    renderPage();

    expect(screen.getByRole("button", { name: "全部标记已读" })).toBeDisabled();
  });
});
