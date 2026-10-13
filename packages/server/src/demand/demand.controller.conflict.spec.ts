import { describe, expect, it } from "vitest";
import { ConflictException, HttpStatus } from "@nestjs/common";

import { DemandController } from "./demand.controller.js";

/**
 * P1-5 门禁：乐观锁冲突必须在**HTTP 层**表现为 409。
 *
 * 为什么不用集成测试：`test:api-data` 里没有任何用例断言过 409
 * （`grep expect(409)` 零命中），而这类映射缺陷恰恰只有真实 HTTP
 * 响应才能发现——单测断言的是 service 的行为，controller 的
 * 字符串匹配清单对它完全不可见。
 *
 * 这里直接构造 controller 并让它把 service 抛出的错误转换出去，
 * 覆盖的正是「错误码 → HttpException」这段真实逻辑，不依赖数据库。
 */
describe("DemandController 的冲突语义（P1-5）", () => {
  function controllerWith(serviceError: Error): DemandController {
    // 只提供 review 路径用得到的依赖；其余方法不在本用例范围内。
    const demands = {
      review: () => Promise.reject(serviceError),
    } as unknown as ConstructorParameters<typeof DemandController>[0];
    const identity = {
      getActorContext: () =>
        Promise.resolve({
          employeeId: "E1",
          roleCodes: ["employee"],
          departmentIds: [],
          primaryDepartmentId: "dept-1",
          sessionId: "s1",
        }),
    } as unknown as ConstructorParameters<typeof DemandController>[1];
    return new DemandController(demands, identity);
  }

  async function reviewExpecting(
    code: string,
  ): Promise<{ status: number; message: string }> {
    const controller = controllerWith(new Error(code));
    try {
      await controller.review("D1", "E1", "s1", {
        decision: "approve",
      } as never);
      throw new Error("本应抛出异常");
    } catch (error) {
      const exception = error as ConflictException;
      return {
        status:
          typeof exception.getStatus === "function"
            ? exception.getStatus()
            : Number.NaN,
        message: String(exception.message),
      };
    }
  }

  it("DEMAND_CONFLICT 映射为 409（原先是 400）", async () => {
    const result = await reviewExpecting("DEMAND_CONFLICT");
    expect(result.status).toBe(HttpStatus.CONFLICT);
    // 业务错误码需原样透出，客户端据此识别并重新拉取状态。
    expect(result.message).toBe("DEMAND_CONFLICT");
  });

  it("状态机已迁移映射为 409", async () => {
    const result = await reviewExpecting("DEMAND_REVIEW_INVALID_STATE");
    expect(result.status).toBe(HttpStatus.CONFLICT);
  });

  it("权限不足仍是 403，不得被误升为 409", async () => {
    const result = await reviewExpecting("DEMAND_REVIEW_FORBIDDEN");
    expect(result.status).toBe(HttpStatus.FORBIDDEN);
  });

  it("找不到资源仍是 404", async () => {
    const result = await reviewExpecting("DEMAND_NOT_FOUND");
    expect(result.status).toBe(HttpStatus.NOT_FOUND);
  });

  it("真正的参数错误仍应是 400", async () => {
    // 防止把「凡是带CONFLICT 字样的一律 409」——那是过度映射，
    // 会让客户端对永久性错误反复重试。
    const result = await reviewExpecting("DEMAND_ATTACHMENT_INVALID");
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
