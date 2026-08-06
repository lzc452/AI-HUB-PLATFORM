import {
  createDatabase,
  seedDemoBusinessData,
} from "../packages/database/src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed demo business data");
}

const database = createDatabase(databaseUrl);

try {
  const result = await seedDemoBusinessData(database);
  console.log(
    `Demo business data seeded: applications=${result.applications}, versions=${result.versions}, demands=${result.demands}, comments=${result.comments}, notifications=${result.notifications}, behaviorEvents=${result.behaviorEvents}`,
  );
} finally {
  await database.destroy();
}
