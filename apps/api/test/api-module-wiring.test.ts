import { Test } from "@nestjs/testing";
import {
  APPLICATION_SERVICE,
  LLM_GATEWAY_SERVICE,
  ModelServiceKeyService,
  PORTAL_SERVICE,
  type ApplicationService,
  type PortalService,
} from "@ai-hub/server";

import { ApiModule } from "../src/api.module.js";

const DATABASE_URL =
  "postgres://ai_hub:ai_hub_local_only@127.0.0.1:5432/ai_hub";

describe("production API module wiring", () => {
  it("compiles the production dynamic module graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.register(DATABASE_URL)],
    }).compile();

    const applications = moduleRef.get<ApplicationService>(APPLICATION_SERVICE);
    const portal = moduleRef.get<PortalService>(PORTAL_SERVICE);
    expect((portal as unknown as { applications: unknown }).applications).toBe(
      applications,
    );

    await moduleRef.close();
  });

  it("未提供模型服务配置时不装配控制面（既有部署行为不变）", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.register(DATABASE_URL)],
    }).compile();

    expect(() => moduleRef.get(LLM_GATEWAY_SERVICE)).toThrow();

    await moduleRef.close();
  });

  it("提供模型服务配置后装配 Key 生命周期服务（防止漏接线）", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // 第 9 个位置参数是模型服务配置（PRD 8.1），其余保持默认
        ApiModule.register(
          DATABASE_URL,
          {},
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            hmacSecret: "0123456789abcdef0123456789abcdef",
            hmacSecretPrevious: undefined,
            maxRpm: 6000,
            maxTpm: 10_000_000,
            maxDailyTokens: 1_000_000_000,
            maxKeysPerUser: 10,
            upstreamBaseUrl: "http://10.10.181.82:3040/v1",
            upstreamTimeoutMs: 120_000,
          },
        ),
      ],
    }).compile();

    expect(moduleRef.get(LLM_GATEWAY_SERVICE)).toBeInstanceOf(
      ModelServiceKeyService,
    );

    await moduleRef.close();
  });
});
