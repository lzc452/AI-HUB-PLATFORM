import { describe, expect, it } from "vitest";
import { assertDemoDataSafety, resolveAnchorDate } from "./demo-config.js";

describe("assertDemoDataSafety", () => {
  it("refuses production regardless of DEMO_DATA_ENABLED", () => {
    expect(() =>
      assertDemoDataSafety({
        nodeEnv: "production",
        demoDataEnabled: "true",
      }),
    ).toThrow(/DEMO_DATA_REFUSED:PRODUCTION/);
  });

  it("refuses when DEMO_DATA_ENABLED is false", () => {
    expect(() =>
      assertDemoDataSafety({
        nodeEnv: "development",
        demoDataEnabled: "false",
      }),
    ).toThrow(/DEMO_DATA_REFUSED:NOT_ENABLED/);
  });

  it("refuses when DEMO_DATA_ENABLED is missing", () => {
    expect(() =>
      assertDemoDataSafety({
        nodeEnv: "development",
      }),
    ).toThrow(/DEMO_DATA_REFUSED:NOT_ENABLED/);
  });

  it("refuses when DEMO_DATA_ENABLED is undefined", () => {
    expect(() =>
      assertDemoDataSafety({
        nodeEnv: "development",
        demoDataEnabled: undefined,
      }),
    ).toThrow(/DEMO_DATA_REFUSED:NOT_ENABLED/);
  });

  it("accepts development with DEMO_DATA_ENABLED=true", () => {
    expect(() =>
      assertDemoDataSafety({
        nodeEnv: "development",
        demoDataEnabled: "true",
      }),
    ).not.toThrow();
  });

  it("accepts test with DEMO_DATA_ENABLED=true", () => {
    expect(() =>
      assertDemoDataSafety({
        nodeEnv: "test",
        demoDataEnabled: "true",
      }),
    ).not.toThrow();
  });
});

describe("resolveAnchorDate", () => {
  it("returns a Date when called with no argument", () => {
    const result = resolveAnchorDate();
    expect(result).toBeInstanceOf(Date);
    // Should be close to now (within 5 seconds)
    const now = Date.now();
    expect(result.getTime()).toBeGreaterThan(now - 5000);
    expect(result.getTime()).toBeLessThanOrEqual(now + 1000);
  });

  it("parses a valid ISO date string", () => {
    const result = resolveAnchorDate("2025-06-15T00:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe("2025-06-15T00:00:00.000Z");
  });

  it("parses a valid date-only string", () => {
    const result = resolveAnchorDate("2025-01-01");
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(0); // January
    expect(result.getUTCDate()).toBe(1);
  });

  it("throws for an invalid date string", () => {
    expect(() => resolveAnchorDate("not-a-date")).toThrow(
      /DEMO_ANCHOR_DATE_INVALID/,
    );
  });
});
