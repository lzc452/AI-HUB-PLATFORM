import { afterEach, describe, expect, it, vi } from "vitest";

const { genericContainer } = vi.hoisted(() => ({
  genericContainer: vi.fn(() => {
    throw new Error(
      "Testcontainers must not start when TEST_DATABASE_URL is set",
    );
  }),
}));

vi.mock("testcontainers", () => ({
  GenericContainer: genericContainer,
  Wait: {
    forLogMessage: vi.fn(),
  },
}));

import { startPostgresTestContainer } from "../src/postgres-test-container.js";

describe("startPostgresTestContainer", () => {
  afterEach(() => {
    delete process.env.TEST_DATABASE_URL;
    vi.clearAllMocks();
  });

  it("reuses the isolated Compose database when TEST_DATABASE_URL is set", async () => {
    const databaseUrl =
      "postgresql://ai_hub:ai_hub_test@postgres:5432/ai_hub_test";
    process.env.TEST_DATABASE_URL = databaseUrl;

    const database = await startPostgresTestContainer();

    expect(database.databaseUrl).toBe(databaseUrl);
    await expect(database.stop()).resolves.toBeUndefined();
    expect(genericContainer).not.toHaveBeenCalled();
  });
});
