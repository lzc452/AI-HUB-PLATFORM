import { describe, expect, it } from "vitest";
import {
  businessDayKey,
  businessDayStart,
  nextBusinessDayStart,
  secondsUntilNextBusinessDay,
} from "./llm-business-day.js";

/**
 * 业务日边界断言。期望值与 `docs/audit/api-platform-landform-verification-2026-10-13.md`
 * 中在真实 PostgreSQL 上跑出的 SQL 结果**逐条一致**（该报告里也记录了「按 UTC 切分」
 * 会导致窗口在北京时间 08:00 才重置的实测证据）。
 */
describe("业务日口径（Asia/Shanghai）", () => {
  it("业务日零点换算到 UTC 是「前一日 16:00」", () => {
    expect(
      businessDayStart(new Date("2026-10-12T15:59:59Z")).toISOString(),
    ).toBe("2026-10-11T16:00:00.000Z");
    expect(
      businessDayStart(new Date("2026-10-12T16:00:00Z")).toISOString(),
    ).toBe("2026-10-12T16:00:00.000Z");
  });

  it("跨零点仍属同一业务日（上海 00:00 与 00:30 同一天）", () => {
    const midnight = new Date("2026-10-12T16:00:00Z"); // 上海 10-13 00:00
    const halfPast = new Date("2026-10-12T16:30:00Z"); // 上海 10-13 00:30
    expect(businessDayStart(midnight).toISOString()).toBe(
      businessDayStart(halfPast).toISOString(),
    );
  });

  it("业务日结束前一刻仍属当日（上海 23:59:59）", () => {
    expect(
      businessDayStart(new Date("2026-10-13T15:59:59Z")).toISOString(),
    ).toBe("2026-10-12T16:00:00.000Z");
  });

  it("下一个业务日零点 = 当日零点 + 24h", () => {
    const at = new Date("2026-10-13T09:00:00Z"); // 上海 17:00
    expect(nextBusinessDayStart(at).toISOString()).toBe(
      "2026-10-13T16:00:00.000Z",
    );
  });

  it("距次日零点剩余秒数正确且有上限", () => {
    // 上海 17:00 → 距次日 00:00 为 7 小时
    expect(secondsUntilNextBusinessDay(new Date("2026-10-13T09:00:00Z"))).toBe(
      25_200,
    );
    // 上海 00:00:00.500 → 不到 24h，向上取整
    expect(
      secondsUntilNextBusinessDay(new Date("2026-10-12T16:00:00.500Z")),
    ).toBe(86_400);
  });

  it("业务日键为上海当地日期（不是 UTC 日期）", () => {
    // UTC 日期是 10-12，上海当地已是 10-13
    expect(businessDayKey(new Date("2026-10-12T16:30:00Z"))).toBe("2026-10-13");
    expect(businessDayKey(new Date("2026-10-12T15:30:00Z"))).toBe("2026-10-12");
  });
});
