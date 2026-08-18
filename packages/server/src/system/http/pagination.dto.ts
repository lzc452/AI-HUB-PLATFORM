import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * 分页查询基 DTO。
 *
 * 所有列表类端点的 `page` / `pageSize` 都应继承此基类，
 * 以统一约束为正整数并限制上限，防止超大页码/页大小引发的存储与计算 DoS。
 * 全局 ValidationPipe 的 `transform: true` 会把查询字符串转为 number，
 * `@IsInt() @Min(1) @Max(200)` 负责运行时校验。
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
