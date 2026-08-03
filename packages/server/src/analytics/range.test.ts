import { describe, expect, it } from "vitest";
import { assertAnalyticsRange } from "./range.js";

describe("analytics range policy", () => {
  it("rejects ranges outside the retained 180-day window", () => {
    expect(() =>
      assertAnalyticsRange(
        "2025-12-31",
        "2026-01-02",
        new Date("2026-08-03T12:00:00Z"),
      ),
    ).toThrow("ANALYTICS_RANGE_INVALID");
  });

  it("allows the current UTC day through the next-day exclusive boundary", () => {
    expect(() =>
      assertAnalyticsRange(
        "2026-08-03",
        "2026-08-04",
        new Date("2026-08-03T12:00:00Z"),
      ),
    ).not.toThrow();
  });
});
