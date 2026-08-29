import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Authenticated,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import { IdentityService } from "../identity/identity.service.js";
import { NOTIFICATION_SERVICE } from "./notification.tokens.js";
import { NotificationService } from "./notification.service.js";
import {
  NotificationRecordDto,
  RetryNotificationRequestDto,
} from "./notification.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("通知")
@Controller("/internal/notifications")
@Authenticated()
export class NotificationController {
  constructor(
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get()
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({
    summary: "通知列表",
    description: "返回当前调用者收到的通知。",
  })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "通知列表",
    type: NotificationRecordDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async list(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.notifications.list(await this.actor(employeeId, sessionId)),
    );
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
  @ApiProblemResponses([400, 401, 403])
  async summary(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () => {
      const unreadCount = await this.notifications.getUnreadCount(
        await this.actor(employeeId, sessionId),
      );
      return { unreadCount };
    });
  }

  @Get(":notificationId")
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: "通知详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "notificationId", description: "通知 ID" })
  @ApiOkResponse({ description: "通知详情", type: NotificationRecordDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async detail(
    @Param("notificationId") notificationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.notifications.getDetail(
        await this.actor(employeeId, sessionId),
        notificationId,
      ),
    );
  }
  @Post(":notificationId/read")
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: "标记通知已读" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "notificationId", description: "通知 ID" })
  @ApiCreatedResponse({
    description: "已读后的通知记录",
    type: NotificationRecordDto,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async markRead(
    @Param("notificationId") notificationId: string,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.notifications.markRead(
        await this.actor(employeeId, sessionId),
        notificationId,
      ),
    );
  }

  @Post("read-all")
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({ summary: "全部标记已读" })
  @ApiIdentityHeaders()
  @ApiCreatedResponse({
    description: "已更新的未读通知数",
    schema: { type: "object", properties: { updated: { type: "number" } } },
  })
  @ApiProblemResponses([400, 401, 403])
  async markAllRead(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () => {
      const updated = await this.notifications.markAllRead(
        await this.actor(employeeId, sessionId),
      );
      return { updated };
    });
  }

  @Post("retry")
  @RequiresPermissions(PERMISSIONS.NOTIFICATION_DELIVER)
  @ApiOperation({ summary: "重试通知投递" })
  @ApiIdentityHeaders()
  @ApiBody({ type: RetryNotificationRequestDto })
  @ApiCreatedResponse({ description: "重试已触发", schema: {} })
  @ApiProblemResponses([400, 401, 403, 404])
  async retry(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: RetryNotificationRequestDto,
  ) {
    return this.call(async () =>
      this.notifications.retryDelivery(
        await this.actor(employeeId, sessionId),
        body.idempotencyKey,
      ),
    );
  }

  private async actor(
    employeeId: string | undefined,
    sessionId: string | undefined,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    return this.identity.getActorContext(employeeId, sessionId);
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapNotificationError(error);
    }
  }
}

/** 把通知域错误映射为 HTTP 语义：越权 403、不存在 404、其余 400。 */
export function mapNotificationError(error: unknown): Error {
  const message =
    error instanceof Error ? error.message : "NOTIFICATION_REQUEST_FAILED";
  if (message === "NOT_AUTHORIZED") {
    return new ForbiddenException("NOT_AUTHORIZED");
  }
  if (message === "NOTIFICATION_NOT_FOUND") {
    return new NotFoundException("NOTIFICATION_NOT_FOUND");
  }
  return new BadRequestException(message);
}
