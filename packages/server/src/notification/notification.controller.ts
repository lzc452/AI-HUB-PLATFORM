import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
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
export class NotificationController {
  constructor(
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get()
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

  @Post(":notificationId/read")
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

  @Post("retry")
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
      throw new BadRequestException(
        error instanceof Error ? error.message : "NOTIFICATION_REQUEST_FAILED",
      );
    }
  }
}
