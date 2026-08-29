import { Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import type { ActorContext } from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Authenticated,
  CurrentActor,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { mapNotificationError } from "../notification/notification.controller.js";
import { NotificationRecordDto } from "../notification/notification.dto.js";
import { NotificationService } from "../notification/notification.service.js";
import { NOTIFICATION_SERVICE } from "../notification/notification.tokens.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

/**
 * Portal 站内通知端点。
 *
 * 与 Web 端 /internal/notifications 共享 NotificationService 与错误语义，
 * 但面向 Portal 前端：使用 @CurrentActor 直接取已解析调用者，不套用
 * PortalCacheControlInterceptor（通知响应一律 private, no-cache）。
 */
@ApiTags("Portal 通知")
@Controller("/internal/portal/notifications")
@Authenticated()
export class PortalNotificationController {
  constructor(
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({
    summary: "通知列表",
    description: "返回当前调用者收到的通知，按创建时间倒序。",
  })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "通知列表",
    type: NotificationRecordDto,
    isArray: true,
  })
  @ApiProblemResponses([401, 403])
  list(@CurrentActor() actor: ActorContext) {
    return this.call(() => this.notifications.list(actor));
  }

  @Get("summary")
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({
    summary: "未读通知计数",
    description: "返回当前调用者的未读通知数。",
  })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "未读通知计数",
    schema: { type: "object", properties: { unreadCount: { type: "number" } } },
  })
  @ApiProblemResponses([401, 403])
  async summary(@CurrentActor() actor: ActorContext) {
    return this.call(async () => {
      const unreadCount = await this.notifications.getUnreadCount(actor);
      return { unreadCount };
    });
  }

  @Post(":notificationId/read")
  @HttpCode(200)
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: "标记通知已读" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "notificationId", description: "通知 ID" })
  @ApiOkResponse({
    description: "已读后的通知记录",
    type: NotificationRecordDto,
  })
  @ApiProblemResponses([401, 403, 404])
  markRead(
    @CurrentActor() actor: ActorContext,
    @Param("notificationId") notificationId: string,
  ) {
    return this.call(() => this.notifications.markRead(actor, notificationId));
  }

  @Post("read-all")
  @HttpCode(200)
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: "全部标记已读" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "已更新的未读通知数",
    schema: { type: "object", properties: { updated: { type: "number" } } },
  })
  @ApiProblemResponses([401, 403])
  async markAllRead(@CurrentActor() actor: ActorContext) {
    return this.call(async () => {
      const updated = await this.notifications.markAllRead(actor);
      return { updated };
    });
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapNotificationError(error);
    }
  }
}
