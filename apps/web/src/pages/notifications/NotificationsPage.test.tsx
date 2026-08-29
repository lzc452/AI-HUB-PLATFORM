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
    payload: {
      body: "您的应用已通过平台审核并正式发布到应用市场。",
      detail: { 应用名称: "OCR票据识别", 版本号: "v1.2.0" },
      title: "「OCR票据识别」已正式发布",
    },
    readAt: null,
    recipientEmployeeId: "E001",
  },
  {
    aggregateId: "app-002",
    createdAt: "2026-08-11T16:30:00+08:00",
    eventType: "application.comment_replied",
    idempotencyKey: "k2",
    message: "用户回复了您在应用「会议纪要总结」下的评论",
    notificationId: "n2",
    readAt: "2026-08-11T16:35:00+08:00",
    recipientEmployeeId: "E001",
  },
  {
    aggregateId: "demand-003",
    createdAt: "2026-08-11T15:00:00+08:00",
    eventType: "demand.progress_updated",
    idempotencyKey: "k3",
    message: "需求「报表自动生成」进度已更新",
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

interface MockMutationResult {
  isPending: boolean;
  mutate: ReturnType<typeof vi.fn>;
}

const hoisted = vi.hoisted(() => ({
  useNotifications: vi.fn(
    (): MockNotificationsResult => ({
      data: mockNotifications,
      error: null,
      isError: false,
      isPending: false,
    }),
  ),
  useMarkNotificationRead: vi.fn(
    (): MockMutationResult => ({ isPending: false, mutate: vi.fn() }),
  ),
  useMarkAllNotificationsRead: vi.fn(
    (): MockMutationResult => ({ isPending: false, mutate: vi.fn() }),
  ),
}));

vi.mock("../../modules/notification/useNotification", () => ({
  useMarkAllNotificationsRead: hoisted.useMarkAllNotificationsRead,
  useMarkNotificationRead: hoisted.useMarkNotificationRead,
  useNotifications: hoisted.useNotifications,
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
    hoisted.useMarkNotificationRead.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
    });
    hoisted.useMarkAllNotificationsRead.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
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

  it("renders notification list with payload titles and real messages", () => {
    renderPage();

    expect(screen.getByRole("tab", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "未读" })).toBeInTheDocument();
    // 有 payload 时列表标题来自 payload.title，摘要来自 message
    expect(screen.getByText("「OCR票据识别」已正式发布")).toBeInTheDocument();
    expect(
      screen.getByText("您的应用「OCR票据识别」审核已通过"),
    ).toBeInTheDocument();
    // 无 payload 时标题与摘要均回退 message（同一文案渲染两处，用 getAllByText）
    expect(
      screen.getAllByText("用户回复了您在应用「会议纪要总结」下的评论").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("需求「报表自动生成」进度已更新").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("共 3 条")).toBeInTheDocument();
  });

  it("filters to unread tab", () => {
    renderPage();

    const unreadTab = screen.getByRole("tab", { name: "未读" });
    fireEvent.click(unreadTab);

    expect(screen.getByText("「OCR票据识别」已正式发布")).toBeInTheDocument();
    expect(
      screen.queryByText("用户回复了您在应用「会议纪要总结」下的评论"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("需求「报表自动生成」进度已更新").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("共 2 条")).toBeInTheDocument();
  });

  it("marks an unread notification read first, then opens the detail modal", () => {
    const mutate = vi.fn();
    hoisted.useMarkNotificationRead.mockReturnValue({
      isPending: false,
      mutate,
    });
    renderPage();

    fireEvent.click(screen.getByText("「OCR票据识别」已正式发布"));

    // 点击即读：未读条目先调用单条已读接口
    expect(mutate).toHaveBeenCalledWith("n1");

    const dialog = screen.getByRole("dialog");
    // 详情优先渲染 payload.title / payload.body / payload.detail
    expect(
      within(dialog).getByText("「OCR票据识别」已正式发布"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("您的应用已通过平台审核并正式发布到应用市场。"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("应用名称: OCR票据识别"),
    ).toBeInTheDocument();
    // 真实字段驱动：事件类型标签 + 通知信息（事件类型/聚合 ID/触发时间）
    expect(within(dialog).getByText("审核相关")).toBeInTheDocument();
    expect(
      within(dialog).getByText("application.published"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("通知信息")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/• 事件类型：application\.published/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/• 聚合 ID：app-001/)).toBeInTheDocument();
    expect(within(dialog).getByText("查看应用详情")).toBeInTheDocument();
    // 硬编码演示字段不得残留
    expect(
      within(dialog).queryByText("系统（审核中心）"),
    ).not.toBeInTheDocument();
  });

  it("opens the detail modal for a read notification without marking it read again", () => {
    const mutate = vi.fn();
    hoisted.useMarkNotificationRead.mockReturnValue({
      isPending: false,
      mutate,
    });
    renderPage();

    fireEvent.click(
      screen.getAllByText("用户回复了您在应用「会议纪要总结」下的评论")[0]!,
    );

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("marks all notifications as read via the server bulk endpoint", () => {
    const mutate = vi.fn();
    hoisted.useMarkAllNotificationsRead.mockReturnValue({
      isPending: false,
      mutate,
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "全部标记已读" }));

    // 批量已读：不再逐条传 ID，由服务端 /read-all 统一处理
    expect(mutate).toHaveBeenCalledWith();
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
