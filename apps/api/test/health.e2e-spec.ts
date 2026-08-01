import { Test } from "@nestjs/testing";
import request from "supertest";

import { ApiModule } from "../src/api.module.js";

describe("health endpoints", () => {
  it("returns liveness without checking dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.forTest({ databaseCheck: async () => true })],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get("/internal/health/live")
      .set("x-request-id", "01JZ3M8V9Z3V4F2V3K0R4Y8P6S")
      .expect(200)
      .expect("x-request-id", "01JZ3M8V9Z3V4F2V3K0R4Y8P6S")
      .expect(({ body }) => {
        expect(body.status).toBe("ok");
      });

    await app.close();
  });

  it("reports readiness as degraded when postgres is down", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.forTest({ databaseCheck: async () => false })],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get("/internal/health/ready")
      .expect(503)
      .expect(({ body }) => {
        expect(body.status).toBe("degraded");
        expect(body.checks.postgres).toBe("down");
        expect(body.timestamp).toEqual(expect.any(String));
      });

    await app.close();
  });

  it("exposes Prometheus metrics on the internal endpoint", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.forTest({ databaseCheck: async () => true })],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get("/internal/metrics")
      .expect(200)
      .expect("Content-Type", /text\/plain/)
      .expect(({ text }) => {
        expect(text).toContain("ai_hub_http_request_duration_seconds");
        expect(text).toContain("ai_hub_database_ready");
      });

    await app.close();
  });
});
