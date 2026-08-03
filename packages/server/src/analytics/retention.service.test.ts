import { describe, expect, it } from "vitest";
import { AnalyticsRetentionService } from "./retention.service.js";
import type { AnalyticsRetentionRepository } from "./retention.types.js";

describe("AnalyticsRetentionService", () => {
  it("purges expired events and records the retention audit in one boundary", async () => {
    const actions: string[] = [];
    const repository: AnalyticsRetentionRepository = {
      withTransaction: async (operation) => operation(repository),
      purgeExpiredEvents: async (now) => {
        expect(now.toISOString()).toBe("2026-08-03T00:00:00.000Z");
        return 3;
      },
      recordAudit: async (input) => {
        actions.push(input.action);
      },
    };

    await expect(
      new AnalyticsRetentionService(repository).run(
        new Date("2026-08-03T00:00:00.000Z"),
      ),
    ).resolves.toEqual({ deleted: 3 });
    expect(actions).toEqual(["analytics.retention.purged"]);
  });
});
