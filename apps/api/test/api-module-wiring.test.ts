import { Test } from "@nestjs/testing";
import {
  APPLICATION_SERVICE,
  PORTAL_SERVICE,
  type ApplicationService,
  type PortalService,
} from "@ai-hub/server";

import { ApiModule } from "../src/api.module.js";

describe("production API module wiring", () => {
  it("compiles the production dynamic module graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.register(
          "postgres://ai_hub:ai_hub_local_only@127.0.0.1:5432/ai_hub",
        ),
      ],
    }).compile();

    const applications = moduleRef.get<ApplicationService>(APPLICATION_SERVICE);
    const portal = moduleRef.get<PortalService>(PORTAL_SERVICE);
    expect((portal as unknown as { applications: unknown }).applications).toBe(
      applications,
    );

    await moduleRef.close();
  });
});
