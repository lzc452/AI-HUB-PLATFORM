import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import type { NotificationService } from "../notification/notification.service.js";
import { NOTIFICATION_SERVICE } from "../notification/notification.tokens.js";
import { PortalNotificationController } from "./portal-notification.controller.js";
import { PortalModule } from "./portal.module.js";

const actor: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-E100",
};

const notification = {
  notificationId: "00000000-0000-0000-0000-000000000001",
  recipientEmployeeId: "E100",
  eventType: "application.published",
  aggregateId: "app-1",
  idempotencyKey: "application.published:app-1:E100",
  message: "应用 app-1 已发布。",
  payload: { title: "应用已发布", body: "应用已进入市场" },
  readAt: null,
  createdAt: "2026-08-28T00:00:00.000Z",
};

describe("PortalNotificationController", () => {
  it("GET / 委托 list 并返回通知列表", async () => {
    const notifications = {
      list: vi.fn().mockResolvedValue([notification]),
    } as unknown as NotificationService;
    const controller = new PortalNotificationController(notifications);

    await expect(controller.list(actor)).resolves.toEqual([notification]);
    expect(notifications.list).toHaveBeenCalledWith(actor);
  });

  it("GET /summary 委托 getUnreadCount 并返回 { unreadCount }", async () => {
    const notifications = {
      getUnreadCount: vi.fn().mockResolvedValue(3),
    } as unknown as NotificationService;
    const controller = new PortalNotificationController(notifications);

    await expect(controller.summary(actor)).resolves.toEqual({
      unreadCount: 3,
    });
    expect(notifications.getUnreadCount).toHaveBeenCalledWith(actor);
  });

  it("POST /:notificationId/read 委托 markRead 并返回已读记录", async () => {
    const notifications = {
      markRead: vi.fn().mockResolvedValue({
        ...notification,
        readAt: "2026-08-28T10:00:00.000Z",
      }),
    } as unknown as NotificationService;
    const controller = new PortalNotificationController(notifications);

    await expect(
      controller.markRead(actor, notification.notificationId),
    ).resolves.toEqual({ ...notification, readAt: "2026-08-28T10:00:00.000Z" });
    expect(notifications.markRead).toHaveBeenCalledWith(
      actor,
      notification.notificationId,
    );
  });

  it("POST /read-all 委托 markAllRead 并返回 { updated }", async () => {
    const notifications = {
      markAllRead: vi.fn().mockResolvedValue(2),
    } as unknown as NotificationService;
    const controller = new PortalNotificationController(notifications);

    await expect(controller.markAllRead(actor)).resolves.toEqual({
      updated: 2,
    });
    expect(notifications.markAllRead).toHaveBeenCalledWith(actor);
  });

  it("越权读他人通知（NOTIFICATION_NOT_FOUND）映射为 404，不泄露存在性", async () => {
    const notifications = {
      markRead: vi.fn().mockRejectedValue(new Error("NOTIFICATION_NOT_FOUND")),
    } as unknown as NotificationService;
    const controller = new PortalNotificationController(notifications);

    await expect(controller.markRead(actor, "n-other")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("无权限（NOT_AUTHORIZED）经错误映射抛 403", async () => {
    const notifications = {
      getUnreadCount: vi.fn().mockRejectedValue(new Error("NOT_AUTHORIZED")),
    } as unknown as NotificationService;
    const controller = new PortalNotificationController(notifications);

    await expect(controller.summary(actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("其余服务端错误保持 400", async () => {
    const notifications = {
      list: vi.fn().mockRejectedValue(new Error("NOTIFICATION_REQUEST_FAILED")),
    } as unknown as NotificationService;
    const controller = new PortalNotificationController(notifications);

    await expect(controller.list(actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("PortalModule.forTest 装配", () => {
  it("注入 NotificationService 时注册 PortalNotificationController 与 NOTIFICATION_SERVICE", () => {
    const notifications = {} as unknown as NotificationService;
    const module = PortalModule.forTest({} as never, notifications);

    expect(module.controllers).toContain(PortalNotificationController);
    expect(module.providers).toContainEqual({
      provide: NOTIFICATION_SERVICE,
      useValue: notifications,
    });
  });

  it("未注入 NotificationService 时不注册 PortalNotificationController", () => {
    const module = PortalModule.forTest({} as never);

    expect(module.controllers).not.toContain(PortalNotificationController);
    expect(module.providers).not.toContainEqual({
      provide: NOTIFICATION_SERVICE,
      useValue: expect.anything(),
    });
  });
});
