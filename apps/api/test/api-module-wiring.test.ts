import { Test } from "@nestjs/testing";

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

    await moduleRef.close();
  });
});
