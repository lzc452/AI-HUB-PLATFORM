import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import { AnalyticsExportService } from "./export.service.js";
import type {
  AnalyticsExportRepository,
  AnalyticsExportRow,
} from "./export.types.js";

const actor = (roles: readonly string[]): ActorContext => ({
  employeeId: "employee-1",
  roleCodes: roles,
  permissions: roles.flatMap((role) =>
    role === "analytics_exporter"
      ? [
          PERMISSIONS.ANALYTICS_EXPORT,
          PERMISSIONS.ANALYTICS_PLATFORM_READ,
          PERMISSIONS.ANALYTICS_MARKET_READ,
          PERMISSIONS.ANALYTICS_APPLICATION_READ,
          PERMISSIONS.ANALYTICS_INNOVATION_READ,
          PERMISSIONS.ANALYTICS_REVIEW_READ,
          PERMISSIONS.ANALYTICS_DEPARTMENT_READ,
          PERMISSIONS.ANALYTICS_RISK_READ,
          PERMISSIONS.ANALYTICS_RUNTIME_READ,
          PERMISSIONS.ANALYTICS_INTEGRATION_READ,
        ]
      : [],
  ),
  departmentIds: ["department-1"],
  primaryDepartmentId: "department-1",
  sessionId: "session-1",
});

describe("AnalyticsExportService", () => {
  it("exports only authorized audience rows and projects anonymous identity", async () => {
    const audits: string[] = [];
    const outbox: string[] = [];
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
      findExportJob: async () => null,
      recordAudit: async (input) => {
        audits.push(input.action);
      },
      appendOutbox: async (input) => {
        outbox.push(input.eventType);
        return true;
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
      "analytics.export.row_projected",
      "analytics.export.completed",
    ]);
    expect(outbox).toEqual([
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
      findExportJob: async () => null,
      recordAudit: async () => undefined,
      appendOutbox: async () => true,
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

  it("requires the target dashboard permission in addition to export permission", async () => {
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => [],
      findExportJob: async () => null,
      recordAudit: async () => undefined,
      appendOutbox: async () => true,
    };
    const exportOnly = {
      ...actor(["custom_exporter"]),
      permissions: [PERMISSIONS.ANALYTICS_EXPORT],
    };
    await expect(
      new AnalyticsExportService(repository).run(exportOnly, {
        target: "platform",
        from: "2026-08-03",
        to: "2026-08-04",
      }),
    ).rejects.toThrow("ANALYTICS_EXPORT_FORBIDDEN");
  });

  it("audits a successful download separately", async () => {
    const actions: string[] = [];
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => [],
      findExportJob: async () => ({
        exportId: "export-1",
        requestedByEmployeeId: "employee-1",
      }),
      recordAudit: async (input) => {
        actions.push(input.action);
      },
      appendOutbox: async () => true,
    };
    const service = new AnalyticsExportService(repository);
    const result = await service.run(actor(["analytics_exporter"]), {
      target: "platform",
      from: "2026-08-03",
      to: "2026-08-04",
    });
    await service.markDownloaded(
      actor(["analytics_exporter"]),
      result.exportId,
    );
    expect(actions).toEqual([
      "analytics.export.requested",
      "analytics.export.completed",
      "analytics.export.downloaded",
    ]);
  });

  it("rejects downloading an export that does not exist or belong to the actor", async () => {
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => [],
      findExportJob: async () => null,
      recordAudit: async () => undefined,
      appendOutbox: async () => true,
    };

    await expect(
      new AnalyticsExportService(repository).markDownloaded(
        actor(["analytics_exporter"]),
        "missing-export",
      ),
    ).rejects.toThrow("ANALYTICS_EXPORT_NOT_FOUND");
  });

  it("audits denied export behavior without reading rows", async () => {
    const actions: string[] = [];
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => [],
      findExportJob: async () => null,
      recordAudit: async (input) => {
        actions.push(input.action);
      },
      appendOutbox: async () => true,
    };

    await expect(
      new AnalyticsExportService(repository).run(actor(["employee"]), {
        target: "platform",
        from: "2026-08-03",
        to: "2026-08-04",
      }),
    ).rejects.toThrow("ANALYTICS_EXPORT_FORBIDDEN");
    expect(actions).toEqual(["analytics.export.denied"]);
  });

  it("keeps denied export audit durable when a transaction would roll back", async () => {
    const actions: string[] = [];
    let transactionStarted = false;
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => {
        transactionStarted = true;
        return operation({
          ...repository,
          recordAudit: async () => {
            throw new Error("TRANSACTION_ROLLED_BACK");
          },
        });
      },
      readVisibleRows: async () => [],
      findExportJob: async () => null,
      recordAudit: async (input) => {
        actions.push(input.action);
      },
      appendOutbox: async () => true,
    };

    await expect(
      new AnalyticsExportService(repository).run(actor(["employee"]), {
        target: "platform",
        from: "2026-08-03",
        to: "2026-08-04",
      }),
    ).rejects.toThrow("ANALYTICS_EXPORT_FORBIDDEN");
    expect(transactionStarted).toBe(false);
    expect(actions).toEqual(["analytics.export.denied"]);
  });

  it("queues analytics.export.completed to the requester on success", async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => [],
      findExportJob: async () => null,
      recordAudit: async () => undefined,
      appendOutbox: async () => true,
    };

    await new AnalyticsExportService(repository, undefined, { queue }).run(
      actor(["analytics_exporter"]),
      { target: "innovation", from: "2026-08-03", to: "2026-08-04" },
    );

    expect(queue).toHaveBeenCalledWith(
      expect.anything(),
      "analytics.export.completed",
      expect.objectContaining({
        recipientEmployeeId: "employee-1",
        variables: { target: "innovation" },
      }),
    );
  });

  it("queues analytics.export.failed without masking the export error", async () => {
    const queue = vi.fn().mockResolvedValue(undefined);
    const repository: AnalyticsExportRepository = {
      withTransaction: async (operation) => operation(repository),
      readVisibleRows: async () => {
        throw new Error("EXPORT_READ_FAILED");
      },
      findExportJob: async () => null,
      recordAudit: async () => undefined,
      appendOutbox: async () => true,
    };
    const service = new AnalyticsExportService(repository, undefined, {
      queue,
    });

    await expect(
      service.run(actor(["analytics_exporter"]), {
        target: "innovation",
        from: "2026-08-03",
        to: "2026-08-04",
      }),
    ).rejects.toThrow("EXPORT_READ_FAILED");

    expect(queue).toHaveBeenCalledWith(
      expect.anything(),
      "analytics.export.failed",
      expect.objectContaining({
        recipientEmployeeId: "employee-1",
      }),
    );
  });
});
