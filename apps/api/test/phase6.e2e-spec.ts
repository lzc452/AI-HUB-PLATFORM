import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  AnalyticsDashboardService,
  AnalyticsExportService,
  AnalyticsAssistantService,
  IdentityService,
  type IdentityRepository,
} from "@ai-hub/server";
import { describe, expect, it } from "vitest";
import { ApiModule } from "../src/api.module.js";

const identityRepository = {
  async findEmployee(employeeId: string) {
    return {
      employeeId,
      displayName: employeeId,
      status: "active" as const,
      primaryDepartmentId: "department-1",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession(sessionId: string) {
    return {
      sessionId,
      employeeId: sessionId.replace("session-", ""),
      deviceLabel: "phase6-api-test",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds() {
    return ["department-1"];
  },
  async listEmployeeRoles() {
    return [
      {
        roleCode: "analytics_operator",
        permissions: ["analytics.read", "analytics.export"],
      },
    ];
  },
} as unknown as IdentityRepository;

describe("Phase 6 analytics endpoints", () => {
  it("keeps dashboard and export routes behind identity and audit-aware services", async () => {
    const dashboard = {
      listFixedDashboards() {
        return ["platform"];
      },
      async read() {
        return {
          dashboardKey: "platform",
          from: "2026-08-03",
          to: "2026-08-04",
          metrics: [],
        };
      },
    } as unknown as AnalyticsDashboardService;
    const exportService = {
      async run() {
        return { exportId: "export-1", rows: [] };
      },
      async markDownloaded() {
        return undefined;
      },
    } as unknown as AnalyticsExportService;
    const assistant = {
      async ask() {
        return { status: "degraded", answer: "Use dashboard" };
      },
    } as unknown as AnalyticsAssistantService;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity: new IdentityService(identityRepository),
          analytics: { dashboard, exportService, assistant },
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const dashboardResponse = await request(app.getHttpServer())
      .get("/internal/analytics/dashboards/platform")
      .query({ from: "2026-08-03", to: "2026-08-04" })
      .set({ "x-employee-id": "E100", "x-session-id": "session-E100" });
    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.dashboardKey).toBe("platform");

    await request(app.getHttpServer())
      .post("/internal/analytics/exports")
      .set({ "x-employee-id": "E100", "x-session-id": "session-E100" })
      .send({ target: "platform", from: "2026-08-03", to: "2026-08-04" })
      .expect(201);

    const assistantResponse = await request(app.getHttpServer())
      .post("/internal/analytics/assistant")
      .set({ "x-employee-id": "E100", "x-session-id": "session-E100" })
      .send({
        question: "Explain the metric",
        context: { metricKey: "platform.application_views", value: 2 },
      })
      .expect(201);
    expect(assistantResponse.body.status).toBe("degraded");

    await app.close();
  });
});
