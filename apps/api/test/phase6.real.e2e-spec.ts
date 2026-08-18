import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AnalyticsAggregationService,
  AnalyticsAssistantService,
  AnalyticsDashboardService,
  AnalyticsEventService,
  AnalyticsExportService,
  DingTalkNotificationMatrixService,
  IdentityService,
  KyselyAnalyticsAggregationRepository,
  KyselyAnalyticsDashboardRepository,
  KyselyAnalyticsEventRepository,
  KyselyAnalyticsExportRepository,
  KyselyAssistantAuditRepository,
  KyselyNotificationRepository,
  NotificationService,
  OutboxWorker,
  createDingTalkNotificationOutboxHandler,
  type IdentityRepository,
} from "@ai-hub/server";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { resetDatabase } from "./reset-database.js";
import { OutboxStore } from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { ApiModule } from "../src/api.module.js";

const headers = {
  "x-employee-id": "E900",
  "x-session-id": "session-E900",
};

const identityRepository = {
  async findEmployee(employeeId: string) {
    return {
      employeeId,
      displayName: "Analytics operator",
      status: "active" as const,
      primaryDepartmentId: "dept-rnd",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession(sessionId: string) {
    return {
      sessionId,
      employeeId: "E900",
      deviceLabel: "phase6-real-api-e2e",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds() {
    return ["dept-rnd"];
  },
  async listEmployeeRoles() {
    return [
      {
        roleCode: "analytics_operator",
        permissions: [
          "analytics.platform.read",
          "analytics.market.read",
          "analytics.application.read",
          "analytics.innovation.read",
          "analytics.review.read",
          "analytics.department.read",
          "analytics.risk.read",
          "analytics.runtime.read",
          "analytics.integration.read",
          "analytics.export",
          "analytics.export.manage",
          "analytics.assistant.use",
          "analytics.scope.all",
        ],
      },
    ];
  },
} as unknown as IdentityRepository;

describe("real Phase 6 analytics API", () => {
  let stop: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDatabase>;
  let app: INestApplication;
  let providerRequest: unknown;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await resetDatabase(db);
    await sql`
      insert into departments (department_id, name, parent_department_id, source)
      values ('dept-rnd', 'R&D', null, 'local')
    `.execute(db);
    await sql`
      insert into employees (employee_id, display_name, status, primary_department_id)
      values ('E900', 'Analytics operator', 'active', 'dept-rnd')
    `.execute(db);
    await sql`
      insert into employees (employee_id, display_name, status, primary_department_id)
      values ('E901', 'Notification recipient', 'active', 'dept-rnd')
    `.execute(db);

    const identity = new IdentityService(identityRepository);
    const event = new AnalyticsEventService(
      new KyselyAnalyticsEventRepository(db),
    );
    const aggregation = new AnalyticsAggregationService(
      new KyselyAnalyticsAggregationRepository(db),
    );
    const dashboard = new AnalyticsDashboardService(
      new KyselyAnalyticsDashboardRepository(db),
    );
    const exportService = new AnalyticsExportService(
      new KyselyAnalyticsExportRepository(db),
    );
    const provider = {
      ask: vi.fn().mockImplementation(async (input: unknown) => {
        providerRequest = input;
        return {
          answer: "Use the dashboard trend.",
          providerRequestId: "dify-test-1",
        };
      }),
    };
    const assistant = new AnalyticsAssistantService(
      new KyselyAssistantAuditRepository(db),
      provider,
    );
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity,
          analytics: { dashboard, exportService, assistant },
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await event.record(
      {
        employeeId: "E900",
        roleCodes: ["analytics_operator"],
        departmentIds: ["dept-rnd"],
        primaryDepartmentId: "dept-rnd",
        sessionId: "session-E900",
      },
      {
        eventName: "application_viewed",
        aggregateType: "application",
        aggregateId: "application-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        idempotencyKey: "phase6-real-event-1",
        metadata: { source: "real-api-e2e" },
      },
    );
    await event.record(
      {
        employeeId: "E900",
        roleCodes: ["analytics_operator"],
        departmentIds: ["dept-rnd"],
        primaryDepartmentId: "dept-rnd",
        sessionId: "session-E900",
      },
      {
        eventName: "application_viewed",
        aggregateType: "application",
        aggregateId: "application-1",
        occurredAt: "2026-08-03T12:00:00.000Z",
        idempotencyKey: "phase6-real-event-1",
        metadata: { source: "real-api-e2e" },
      },
    );
    await event.record(
      {
        employeeId: "E900",
        roleCodes: ["analytics_operator"],
        departmentIds: ["dept-rnd"],
        primaryDepartmentId: "dept-rnd",
        sessionId: "session-E900",
      },
      {
        eventName: "application_viewed",
        aggregateType: "application",
        aggregateId: "application-2",
        occurredAt: "2026-08-03T13:00:00.000Z",
        idempotencyKey: "phase6-real-event-2",
        metadata: { source: "real-api-e2e" },
      },
    );
    await aggregation.rebuild(
      "2026-08-03T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
    );

    // 需求价值看板数据源：ai_demands + ai_demand_audit_events（无行为事件）。
    await sql`
      insert into ai_demands (
        demand_id, requester_employee_id, title, problem_statement, desired_outcome,
        status, audience_type, audience_department_id, include_children, display_anonymously,
        priority_score, version
      ) values (
        '11111111-1111-1111-1111-111111111111', 'E900', 'Demand for e2e', 'Problem',
        'Outcome', 'converted', 'department', 'dept-rnd', false, false,
        4.2, 1
      )
    `.execute(db);
    await sql`
      insert into ai_demand_audit_events (
        demand_id, actor_employee_id, event_type, details, created_at
      ) values
        ('11111111-1111-1111-1111-111111111111', 'E900', 'demand.submitted', '{}', '2026-08-03T09:00:00.000Z'),
        ('11111111-1111-1111-1111-111111111111', 'E900', 'demand.status.changed', '{"from":"pending_review","to":"converted"}', '2026-08-03T10:00:00.000Z'),
        ('11111111-1111-1111-1111-111111111111', 'E900', 'demand.priority.updated', '{"score":4.2}', '2026-08-03T11:00:00.000Z'),
        ('11111111-1111-1111-1111-111111111111', 'E900', 'demand.pilot.updated', '{"status":"completed"}', '2026-08-03T12:00:00.000Z')
    `.execute(db);
    await event.record(
      {
        employeeId: "E900",
        roleCodes: ["analytics_operator"],
        departmentIds: ["dept-rnd"],
        primaryDepartmentId: "dept-rnd",
        sessionId: "session-E900",
      },
      {
        eventName: "application_downloaded",
        aggregateType: "application",
        aggregateId: "application-1",
        occurredAt: "2026-08-03T14:00:00.000Z",
        idempotencyKey: "phase6-real-event-download-1",
        metadata: { channel: "web" },
      },
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("serves rebuildable metrics, audited exports, and a redacted assistant request from PostgreSQL", async () => {
    const dashboard = await request(app.getHttpServer())
      .get("/internal/analytics/dashboards/platform")
      .query({ from: "2026-08-03", to: "2026-08-04" })
      .set(headers)
      .expect(200);
    expect(dashboard.body.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: "platform.application_views",
          value: 2,
        }),
        expect.objectContaining({
          metricKey: "platform.active_employee_count",
        }),
        expect.objectContaining({
          metricKey: "platform.active_application_count",
        }),
        expect.objectContaining({
          metricKey: "platform.published_application_count",
        }),
        expect.objectContaining({
          metricKey: "platform.pending_review_count",
        }),
        expect.objectContaining({
          metricKey: "platform.pending_claim_count",
        }),
      ]),
    );

    const exportResponse = await request(app.getHttpServer())
      .post("/internal/analytics/exports")
      .set(headers)
      .send({ target: "platform", from: "2026-08-03", to: "2026-08-04" })
      .expect(201);
    expect(exportResponse.body.rows).toEqual([
      expect.objectContaining({ value: 2, requester: "Anonymous" }),
    ]);

    const assistant = await request(app.getHttpServer())
      .post("/internal/analytics/assistant")
      .set(headers)
      .send({
        question: "Explain the application view trend.",
        context: {
          metricKey: "platform.application_views",
          value: 2,
          employeeNumber: "E900",
          internalUrl: "http://internal.example",
          file: "secret.txt",
          qrCode: "secret-qr",
          anonymousIdentity: "person-1",
        },
      })
      .expect(201);
    expect(assistant.body).toMatchObject({ status: "ok" });
    expect(providerRequest).toEqual({
      question: "Explain the application view trend.",
      context: { metricKey: "platform.application_views", value: 2 },
    });

    const notifications = new NotificationService(
      new KyselyNotificationRepository(db),
      { authorize: async () => ({ allowed: true, reasonCode: "ALLOW_TEST" }) },
      { send: async () => ({ delivered: true }) },
    );
    await new DingTalkNotificationMatrixService(
      notifications,
      async () => true,
    ).queue(
      {
        employeeId: "E900",
        roleCodes: ["analytics_operator"],
        departmentIds: ["dept-rnd"],
        primaryDepartmentId: "dept-rnd",
        sessionId: "session-E900",
      },
      "analytics.export.completed",
      {
        recipientEmployeeId: "E901",
        aggregateId: "export-real-1",
        variables: { target: "platform" },
      },
    );
    const dingtalk = { send: vi.fn().mockResolvedValue({ delivered: true }) };
    const notificationHandler = createDingTalkNotificationOutboxHandler(
      new KyselyNotificationRepository(db),
      dingtalk,
    );
    const outboxWorker = new OutboxWorker(new OutboxStore(db), {
      "analytics.behavior_event.recorded": async () => undefined,
      "notification.created": (event) =>
        notificationHandler(event as Parameters<typeof notificationHandler>[0]),
    });
    // OutboxWorker.runOnce 每次只领取一条事件；analytics 请求已先写入
    // behavior_event 事件，需循环排空队列直到通知事件被处理。
    for (let processed = 1; processed > 0; ) {
      processed = await outboxWorker.runOnce("phase6-real-worker");
    }
    expect(dingtalk.send).toHaveBeenCalledWith({
      idempotencyKey: "analytics.export.completed:export-real-1:E901",
      recipientEmployeeId: "E901",
      message: "分析导出 export-real-1 已就绪（platform）。",
    });
    const delivery = await sql<{ delivery_status: string }>`
      select delivery_status
      from notifications
      where idempotency_key = 'analytics.export.completed:export-real-1:E901'
    `.execute(db);
    expect(delivery.rows[0]?.delivery_status).toBe("sent");
    const outboxPayload = await sql<{ payload: Record<string, unknown> }>`
      select payload
      from outbox_events
      where idempotency_key = 'analytics.export.completed:export-real-1:E901'
    `.execute(db);
    expect(outboxPayload.rows[0]?.payload).toMatchObject({
      notificationScenario: "analytics.export.completed",
      recipientRole: "export_requester",
      actorEmployeeId: "E900",
    });

    const auditActions = await sql<{ action: string }>`
      select action
      from analytics_audit_events
      where actor_employee_id = 'E900'
      order by created_at
    `.execute(db);
    expect(auditActions.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "analytics.export.requested",
        "analytics.export.completed",
        "analytics.assistant.requested",
        "analytics.assistant.completed",
      ]),
    );
    const rawEvents = await sql<{ count: string }>`
      select count(*)::text as count from analytics_behavior_events
    `.execute(db);
    expect(rawEvents.rows[0]?.count).toBe("3");
  });

  it("serves demand-value metrics, snapshot KPIs, and application-scoped dashboards from PostgreSQL", async () => {
    const demandValue = await request(app.getHttpServer())
      .get("/internal/analytics/dashboards/demand_value")
      .query({ from: "2026-08-03", to: "2026-08-04" })
      .set(headers)
      .expect(200);
    const byKey = new Map(
      demandValue.body.metrics.map(
        (metric: { metricKey: string; value: number }) => [
          metric.metricKey,
          metric.value,
        ],
      ),
    );
    expect(byKey.get("demand.converted_count")).toBe(1);
    expect(byKey.get("demand.converted_rate")).toBe(100);
    expect(byKey.get("demand.avg_priority_score")).toBe(4.2);
    expect(byKey.get("demand.pilot_completed_count")).toBe(1);

    const platform = await request(app.getHttpServer())
      .get("/internal/analytics/dashboards/platform")
      .query({ from: "2026-08-03", to: "2026-08-04" })
      .set(headers)
      .expect(200);
    expect(platform.body.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: "demand.converted_count",
          value: 1,
        }),
        expect.objectContaining({
          metricKey: "risk.high_risk_application_count",
        }),
      ]),
    );

    const scoped = await request(app.getHttpServer())
      .get("/internal/analytics/dashboards/application")
      .query({
        from: "2026-08-03",
        to: "2026-08-04",
        applicationId: "application-1",
      })
      .set(headers)
      .expect(200);
    expect(scoped.body.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: "application.downloads",
          value: 1,
        }),
      ]),
    );

    await request(app.getHttpServer())
      .get("/internal/analytics/dashboards/platform")
      .query({
        from: "2026-08-03",
        to: "2026-08-04",
        applicationId: "application-1",
      })
      .set(headers)
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "ANALYTICS_DASHBOARD_APPLICATION_SCOPE_INVALID",
        });
      });
  });
});
