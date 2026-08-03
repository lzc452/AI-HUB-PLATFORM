import { describe, expect, it } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import { AnalyticsExportService } from "./export.service.js";
import type {
  AnalyticsExportRepository,
  AnalyticsExportRow,
} from "./export.types.js";

const actor = (roles: readonly string[]): ActorContext => ({
  employeeId: "employee-1",
  roleCodes: roles,
  departmentIds: ["department-1"],
  primaryDepartmentId: "department-1",
  sessionId: "session-1",
});

describe("AnalyticsExportService", () => {
  it("exports only authorized audience rows and projects anonymous identity", async () => {
    const audits: string[] = [];
    const rows: AnalyticsExportRow[] = [
      {
        aggregateId: "demand-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        value: 3,
        requesterEmployeeId: "employee-2",
        displayAnonymously: true,
      },
    ];
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async (input) => {
        expect(input.actor.employeeId).toBe("employee-1");
        return rows;
      },
      recordAudit: async (input) => {
        audits.push(input.action);
      },
    };

    const result = await new AnalyticsExportService(repository).run(
      actor(["analytics_exporter"]),
      { target: "innovation", from: "2026-08-03", to: "2026-08-04" },
    );

    expect(result.rows).toEqual([
      {
        aggregateId: "demand-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        value: 3,
        requester: "Anonymous",
      },
    ]);
    expect(audits).toEqual([
      "analytics.export.requested",
      "analytics.export.completed",
    ]);
  });

  it("rejects unauthorized or overlong exports before reading rows", async () => {
    let readCount = 0;
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => {
        readCount += 1;
        return [];
      },
      recordAudit: async () => undefined,
    };
    const service = new AnalyticsExportService(repository);

    await expect(
      service.run(actor(["application_owner"]), {
        target: "platform",
        from: "2026-08-03",
        to: "2026-08-04",
      }),
    ).rejects.toThrow("ANALYTICS_EXPORT_FORBIDDEN");
    await expect(
      service.run(actor(["analytics_exporter"]), {
        target: "platform",
        from: "2026-01-01",
        to: "2026-08-04",
      }),
    ).rejects.toThrow("ANALYTICS_EXPORT_RANGE_INVALID");
    expect(readCount).toBe(0);
  });

  it("audits a successful download separately", async () => {
    const actions: string[] = [];
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => [],
      recordAudit: async (input) => {
        actions.push(input.action);
      },
    };
    const service = new AnalyticsExportService(repository);
    const result = await service.run(actor(["analytics_exporter"]), {
      target: "platform",
      from: "2026-08-03",
      to: "2026-08-04",
    });
    await service.markDownloaded(actor(["analytics_exporter"]), result.exportId);
    expect(actions).toEqual([
      "analytics.export.requested",
      "analytics.export.completed",
      "analytics.export.downloaded",
    ]);
  });
});
