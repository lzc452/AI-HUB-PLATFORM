import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { mapNotificationError } from "./notification.controller.js";

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
