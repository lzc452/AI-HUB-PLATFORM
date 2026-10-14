import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { toDomainHttpException } from "../system/http/domain-error.js";
import {
  MODEL_SERVICE_ERROR_CODES,
  ModelServiceError,
} from "./llm-gateway.types.js";

/**
 * 控制面领域错误 → HTTP 语义的单一落点（两个控制面控制器共用）。
 *
 * 冲突类三个码已登记在 `system/http/domain-error.ts`（统一映射 409）；
 * 404/400/503 在平台没有通用映射，就地显式处理——避免重蹈「未登记错误码被降级成 400」。
 */
export function toControlPlaneHttpException(error: unknown): never {
  if (error instanceof ModelServiceError) {
    switch (error.code) {
      case MODEL_SERVICE_ERROR_CODES.NOT_FOUND:
      case MODEL_SERVICE_ERROR_CODES.ADMIN_TARGET_NOT_FOUND:
        throw new NotFoundException(error.code);
      case MODEL_SERVICE_ERROR_CODES.INVALID_LIMIT:
      case MODEL_SERVICE_ERROR_CODES.RANGE_INVALID:
        throw new BadRequestException(error.code);
      case MODEL_SERVICE_ERROR_CODES.NOT_CONFIGURED:
      case MODEL_SERVICE_ERROR_CODES.DISABLED:
        throw new ServiceUnavailableException(error.code);
      default:
        throw toDomainHttpException(
          error.code,
          () => new ConflictException(error.code),
        );
    }
  }
  throw error;
}
