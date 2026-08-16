import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** 重试通知投递请求。 */
export class RetryNotificationRequestDto {
  @ApiProperty({
    type: String,
    description: "通知幂等键",
    example: "application.published:app-1:DEMO-EMPLOYEE",
  })
  idempotencyKey!: string;
}

/** 通知记录。 */
export class NotificationRecordDto {
  @ApiProperty({
    type: String,
    description: "通知 ID",
    example: "00000000-0000-0000-0000-000000000000",
  })
  notificationId!: string;

  @ApiProperty({
    type: String,
    description: "接收人员工工号",
    example: "DEMO-EMPLOYEE",
  })
  recipientEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "事件类型",
    example: "application.published",
  })
  eventType!: string;

  @ApiProperty({ type: String, description: "聚合 ID", example: "app-1" })
  aggregateId!: string;

  @ApiProperty({
    type: String,
    description: "幂等键",
    example: "application.published:app-1:DEMO-EMPLOYEE",
  })
  idempotencyKey!: string;

  @ApiProperty({
    type: String,
    description: "通知内容",
    example: "应用 app-1 已发布。",
  })
  message!: string;

  @ApiProperty({
    type: Object,
    description: "通知详情结构化 payload",
    example: {
      title: "应用已发布",
      body: "应用已进入市场",
      deepLink: "/marketplace/app-1",
    },
  })
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "已读时间（ISO 8601），未读为 null",
    type: String,
    format: "date-time",
    nullable: true,
  })
  readAt?: string | null;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}
