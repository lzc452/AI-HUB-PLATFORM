import { describe, expect, it, vi } from "vitest";
import { AuditService } from "./audit.service.js";
import type { AuditEventInput, AuditRepository } from "./audit.types.js";

function createRepository(
  overrides: Partial<AuditRepository> = {},
): AuditRepository {
  return {
    listEvents: vi.fn(async () => ({ items: [], total: 0 })),
    createExportJob: vi.fn(async () => {
      throw new Error("unused");
    }),
    findExportJob: vi.fn(async () => null),
    claimExportJob: vi.fn(async () => null),
    completeExportJob: vi.fn(async () => null),
    failExportJob: vi.fn(async () => null),
    createEvent: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as AuditRepository;
}

const baseEvent: AuditEventInput = {
  module: "application",
  action: "application.review.approve",
  actorEmployeeId: "E001",
  subject: "APP-1",
  result: "success",
};

describe("AuditService", () => {
  describe("recordEvent", () => {
    it("仓储写入失败时不抛错，调用方主流程不受影响", async () => {
      const createEvent = vi.fn(async () => {
        throw new Error("pg down");
      });
      const service = new AuditService(createRepository({ createEvent }));
      const warn = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).logger = { warn };

      await expect(service.recordEvent(baseEvent)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("未装配 logger 时写失败同样静默", async () => {
      const createEvent = vi.fn(async () => {
        throw new Error("pg down");
      });
      const service = new AuditService(createRepository({ createEvent }));

      await expect(service.recordEvent(baseEvent)).resolves.toBeUndefined();
    });

    it("调用方显式传入的 traceId 优先于兜底生成", async () => {
      const createEvent = vi.fn(async () => undefined);
      const service = new AuditService(createRepository({ createEvent }));

      await service.recordEvent({ ...baseEvent, traceId: "TRACE-FROM-CALLER" });

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: "TRACE-FROM-CALLER" }),
      );
    });

    it("调用方未传 traceId 时自动补齐（审计与日志可对齐）", async () => {
      const written: AuditEventInput[] = [];
      const createEvent = vi.fn(async (input: AuditEventInput) => {
        written.push(input);
      });
      const service = new AuditService(createRepository({ createEvent }));

      await service.recordEvent(baseEvent);

      // 兜底必须是非空字符串：空 traceId 等于该事件永远无法与日志对齐。
      expect(typeof written[0]?.traceId).toBe("string");
      expect(written[0]?.traceId).not.toBe("");
    });

    it("不篡改调用方传入的其他字段", async () => {
      const createEvent = vi.fn(async () => undefined);
      const service = new AuditService(createRepository({ createEvent }));
      const input: AuditEventInput = {
        ...baseEvent,
        result: "failure",
        risk: "critical",
        details: { decision: "reject" },
      };

      await service.recordEvent(input);

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          module: "application",
          action: "application.review.approve",
          result: "failure",
          risk: "critical",
          details: { decision: "reject" },
        }),
      );
    });
  });

  describe("listEvents", () => {
    it("page 小于 1 时归一为 1", async () => {
      const listEvents = vi.fn(async () => ({ items: [], total: 0 }));
      const service = new AuditService(createRepository({ listEvents }));

      await service.listEvents({ page: 0, pageSize: 50 });

      expect(listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 50 }),
      );
    });

    it("pageSize 超过 200 时截断到 200", async () => {
      const listEvents = vi.fn(async () => ({ items: [], total: 0 }));
      const service = new AuditService(createRepository({ listEvents }));

      await service.listEvents({ page: 1, pageSize: 5000 });

      expect(listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 200 }),
      );
    });

    it("pageSize 小于 1 时归一为 1", async () => {
      const listEvents = vi.fn(async () => ({ items: [], total: 0 }));
      const service = new AuditService(createRepository({ listEvents }));

      await service.listEvents({ page: 1, pageSize: -3 });

      expect(listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 1 }),
      );
    });
  });
});
