import { describe, expect, it } from "vitest";
import {
  ConflictException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";

import { isConflictCode, toDomainHttpException } from "./domain-error.js";

/**
 * P1-5门禁：乐观锁冲突不得被降级成 400。
 *
 * 事故背景：`DEMAND_CONFLICT`（仓储里 24 处抛出）没有被任何 controller
 * 登记在错误映射清单里，兜底成 `BadRequestException`。
 * 而客户端只对 409 触发重试，所以并发冲突永远不会重试，
 * 用户看到的是误导性的「参数错误」。
 */
describe("领域错误码 → HTTP 语义（P1-5）", () => {
  it("乐观锁冲突判定为 409", () => {
    expect(isConflictCode("DEMAND_CONFLICT")).toBe(true);
    expect(isConflictCode("APPLICATION_STATE_CONFLICT")).toBe(true);
  });

  it("状态机已迁移判定为 409", () => {
    // 客户端重新读取状态后重试是有意义的，因此属于冲突而非参数错误。
    for (const code of [
      "DEMAND_REVIEW_INVALID_STATE",
      "DEMAND_SUBMIT_INVALID_STATE",
      "DEMAND_CLAIM_INVALID_STATE",
      "DEMAND_CLAIM_PROPOSAL_INVALID_STATE",
      "DEMAND_RELEASE_INVALID_STATE",
      "DEMAND_PILOT_INVALID_STATE",
      "DEMAND_MERGE_INVALID_STATE",
      "DEMAND_APPLICATION_BRIDGE_INVALID_STATE",
    ]) {
      expect(isConflictCode(code), code).toBe(true);
    }
  });

  it("明确不是冲突的错误码不被误判", () => {
    // 把未登记的错误码误判成 409 会让客户端白白重试，
    // 所以未知码必须保守地落回 400。
    for (const code of [
      "DEMAND_NOT_FOUND",
      "DEMAND_REVIEW_FORBIDDEN",
      "DEMAND_ATTACHMENT_INVALID",
      "DEMAND_PAGINATION_INVALID",
      "SOMETHING_UNKNOWN",
    ]) {
      expect(isConflictCode(code), code).toBe(false);
    }
  });

  it("未知错误码走兜底，不被包装成 409", () => {
    const result = toDomainHttpException(
      "DEMAND_NOT_FOUND",
      () => new NotFoundException("DEMAND_NOT_FOUND"),
    );
    expect(result).toBeInstanceOf(NotFoundException);
    expect(result.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it("冲突码被包装成 ConflictException 且状态码为 409", () => {
    const result = toDomainHttpException(
      "DEMAND_CONFLICT",
      () => new ConflictException("兜底不应被调用"),
    );
    expect(result).toBeInstanceOf(ConflictException);
    expect(result.getStatus()).toBe(HttpStatus.CONFLICT);
    // 业务错误码需原样透出，客户端据此识别并重新拉取状态。
    expect(result.message).toBe("DEMAND_CONFLICT");
  });
});
