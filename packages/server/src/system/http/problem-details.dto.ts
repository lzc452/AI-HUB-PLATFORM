import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** 草稿校验失败时返回的单项问题。 */
export class ProblemIssueDto {
  @ApiProperty({
    type: String,
    description: "稳定的问题码",
    example: "DELIVERY_REQUIRED",
  })
  code!: string;

  @ApiProperty({
    type: String,
    description: "面向调用方的问题说明",
    example: "至少配置一个交付方式",
  })
  message!: string;

  @ApiPropertyOptional({
    type: String,
    description: "问题所在字段路径；无精确字段时省略",
    example: "deliveries",
  })
  path?: string;
}

/** RFC 7807 问题详情，所有错误响应的统一模型。 */
export class ProblemDetailsDto {
  @ApiProperty({
    type: String,
    description: "问题类型 URI",
    example: "about:blank",
  })
  type!: string;

  @ApiProperty({
    type: String,
    description: "问题标题",
    example: "Bad Request",
  })
  title!: string;

  @ApiProperty({ type: Number, description: "HTTP 状态码", example: 400 })
  status!: number;

  @ApiProperty({ type: String, description: "错误码", example: "BAD_REQUEST" })
  code!: string;

  @ApiProperty({
    type: String,
    description: "面向调用方的稳定错误消息",
    example: "请求参数无效",
  })
  message!: string;

  @ApiPropertyOptional({
    type: String,
    description: "错误详情",
    example: "IDENTITY_HEADERS_REQUIRED",
  })
  detail?: string;

  @ApiProperty({
    type: String,
    description: "请求追踪 ID",
    example: "trace-000000000000000000000000",
  })
  traceId!: string;

  @ApiPropertyOptional({
    description: "字段级校验错误",
    type: Object,
    additionalProperties: { type: "array", items: { type: "string" } },
  })
  fieldErrors?: Readonly<Record<string, readonly string[]>>;

  @ApiPropertyOptional({
    type: () => ProblemIssueDto,
    isArray: true,
    description:
      "草稿业务校验问题列表；当 code=DRAFT_VALIDATION_FAILED 时返回。",
  })
  issues?: readonly ProblemIssueDto[];
}
