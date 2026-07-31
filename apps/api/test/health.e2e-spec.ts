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
      .expect(200)
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
        expect(body.checks.postgres).toBe("down");
      });

    await app.close();
  });
});
