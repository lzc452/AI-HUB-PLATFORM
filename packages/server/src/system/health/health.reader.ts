import type { HealthSnapshot } from "@ai-hub/contracts";

export type DatabaseHealthCheck = () => Promise<boolean>;

export class HealthReader {
  constructor(
    private readonly databaseCheck: DatabaseHealthCheck,
    private readonly now: () => Date = () => new Date(),
  ) {}

  live(): HealthSnapshot {
    return {
      status: "ok",
      checks: {},
      timestamp: this.now().toISOString(),
    };
  }

  async ready(): Promise<HealthSnapshot> {
    const postgresUp = await this.databaseCheck();

    return {
      status: postgresUp ? "ok" : "degraded",
      checks: { postgres: postgresUp ? "up" : "down" },
      timestamp: this.now().toISOString(),
    };
  }
}
