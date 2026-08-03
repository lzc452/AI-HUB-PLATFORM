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
import { IdentityService } from "../identity/identity.service.js";
import { NOTIFICATION_SERVICE } from "./notification.tokens.js";
import { NotificationService } from "./notification.service.js";

@Controller("/internal/notifications")
export class NotificationController {
  constructor(
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get()
  async list(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    return this.call(async () =>
      this.notifications.list(await this.actor(employeeId, sessionId)),
    );
  }

  @Post(":notificationId/read")
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
  async retry(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body()
    body: {
      idempotencyKey: string;
    },
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
