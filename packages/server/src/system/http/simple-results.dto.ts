import { ApiProperty } from "@nestjs/swagger";

/** 通用布尔结果（点赞切换等）。 */
export class LikeResultDto {
  @ApiProperty({ type: Boolean, description: "点赞后的状态", example: true })
  liked!: boolean;
}

/** 通用记录完成结果。 */
export class RecordActionResultDto {
  @ApiProperty({ type: Boolean, description: "是否已记录", example: true })
  recorded!: boolean;
}

/** 匿名作者查询结果。 */
export class EmployeeIdResultDto {
  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;
}
