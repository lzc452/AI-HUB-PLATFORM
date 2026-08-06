import { ApiHeader, ApiResponse } from "@nestjs/swagger";
import { ProblemDetailsDto } from "./problem-details.dto.js";

const PROBLEM_DESCRIPTIONS: Readonly<Record<number, string>> = Object.freeze({
  400: "请求参数无效或业务规则校验失败",
  401: "未认证：登录凭证无效或会话已过期",
  403: "无权限执行该操作",
  404: "资源不存在",
  409: "状态冲突或请求重复",
  422: "请求无法处理",
  429: "请求过于频繁",
  500: "服务器内部错误",
});

/** 标注调用者身份请求头（x-employee-id 与 x-session-id）。 */
export function ApiIdentityHeaders(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    ApiHeader({
      name: "x-employee-id",
      description: "调用者员工工号",
      required: true,
      example: "DEMO-EMPLOYEE",
    })(target, propertyKey, descriptor);
    ApiHeader({
      name: "x-session-id",
      description: "调用者会话 ID",
      required: true,
      example: "00000000-0000-0000-0000-000000000000",
    })(target, propertyKey, descriptor);
  };
}

/** 标注 Problem Details 错误响应。 */
export function ApiProblemResponses(
  statuses: readonly number[],
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    for (const status of statuses) {
      ApiResponse({
        status,
        description: PROBLEM_DESCRIPTIONS[status] ?? "请求失败",
        type: ProblemDetailsDto,
      })(target, propertyKey, descriptor);
    }
  };
}
