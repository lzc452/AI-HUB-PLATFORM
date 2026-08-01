import { GenericContainer, Wait } from "testcontainers";

const POSTGRES_PORT = 5432;

export async function startPostgresTestContainer(): Promise<{
  databaseUrl: string;
  stop: () => Promise<void>;
}> {
  const sharedDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (sharedDatabaseUrl) {
    return {
      databaseUrl: sharedDatabaseUrl,
      stop: async () => undefined,
    };
  }

  const container = await new GenericContainer("postgres:18.4-bookworm")
    .withEnvironment({
      POSTGRES_DB: "ai_hub_test",
      POSTGRES_PASSWORD: "postgres",
      POSTGRES_USER: "postgres",
    })
    .withExposedPorts(POSTGRES_PORT)
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .withStartupTimeout(60_000)
    .start();

  const databaseUrl = `postgresql://postgres:postgres@${container.getHost()}:${container.getMappedPort(POSTGRES_PORT)}/ai_hub_test`;

  return {
    databaseUrl,
    stop: async () => {
      await container.stop();
    },
  };
}
