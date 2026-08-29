import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import type { IdentityService } from "../identity/identity.service.js";
import {
  NotificationController,
  mapNotificationError,
} from "./notification.controller.js";
import type { NotificationService } from "./notification.service.js";

const employee: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-E100",
};

const identity = {
  getActorContext: async () => employee,
} as unknown as IdentityService;

describe("mapNotificationError", () => {
  it("把越权映射为 403", () => {
    const result = mapNotificationError(new Error("NOT_AUTHORIZED"));
    expect(result).toBeInstanceOf(ForbiddenException);
    expect(result.message).toBe("NOT_AUTHORIZED");
  });

  it("把跨收件人不存在的通知映射为 404，不泄露存在性", () => {
    const result = mapNotificationError(new Error("NOTIFICATION_NOT_FOUND"));
    expect(result).toBeInstanceOf(NotFoundException);
    expect(result.message).toBe("NOTIFICATION_NOT_FOUND");
  });

  it("其余错误保持 400", () => {
    const result = mapNotificationError(new Error("DINGTALK_PROVIDER_FAILED"));
    expect(result).toBeInstanceOf(BadRequestException);
    expect(result.message).toBe("DINGTALK_PROVIDER_FAILED");
  });
});

describe("NotificationController summary/read-all", () => {
  it("GET summary 委托 getUnreadCount 并返回 { unreadCount }", async () => {
    const notifications = {
      getUnreadCount: vi.fn().mockResolvedValue(3),
    } as unknown as NotificationService;
    const controller = new NotificationController(notifications, identity);

    await expect(controller.summary("E100", "session-E100")).resolves.toEqual({
      unreadCount: 3,
    });
    expect(notifications.getUnreadCount).toHaveBeenCalledWith(employee);
  });

  it("POST read-all 委托 markAllRead 并返回 { updated }", async () => {
    const notifications = {
      markAllRead: vi.fn().mockResolvedValue(2),
    } as unknown as NotificationService;
    const controller = new NotificationController(notifications, identity);

    await expect(
      controller.markAllRead("E100", "session-E100"),
    ).resolves.toEqual({ updated: 2 });
    expect(notifications.markAllRead).toHaveBeenCalledWith(employee);
  });

  it("未授权时经 mapNotificationError 抛 403", async () => {
    const notifications = {
      getUnreadCount: vi.fn().mockRejectedValue(new Error("NOT_AUTHORIZED")),
    } as unknown as NotificationService;
    const controller = new NotificationController(notifications, identity);

    await expect(
      controller.summary("E100", "session-E100"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("缺少身份头时抛 400 IDENTITY_HEADERS_REQUIRED", async () => {
    const notifications = {} as unknown as NotificationService;
    const controller = new NotificationController(notifications, identity);

    await expect(controller.summary(undefined, undefined)).rejects.toThrow(
      "IDENTITY_HEADERS_REQUIRED",
    );
  });
});
