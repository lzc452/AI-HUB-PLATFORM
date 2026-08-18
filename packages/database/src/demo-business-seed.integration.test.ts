import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { createDatabase, runMigrations } from "./index.js";
import { DEMO_ACCOUNT_DEFINITIONS, seedDemoAccounts } from "./demo-seed.js";
import { seedDemoBusinessData } from "./demo-business-seed.js";

const APP_PUBLISHED = "10000000-0000-4000-8000-000000000001";
const APP_IN_REVIEW = "10000000-0000-4000-8000-000000000002";
const VERSION_PUBLISHED = "10000000-0000-4000-8000-000000000101";
const DEMAND_PUBLISHED = "20000000-0000-4000-8000-000000000001";
const DEMAND_MERGED = "20000000-0000-4000-8000-000000000004";
const REPORT_RESOLVED = "40000000-0000-4000-8000-000000000002";

describe("demo business seed", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);

    const passwordHashes = Object.fromEntries(
      DEMO_ACCOUNT_DEFINITIONS.map(({ employeeId }) => [
        employeeId,
        `hash-for-${employeeId}`,
      ]),
    );
    await seedDemoAccounts(db, passwordHashes);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("seeds full-coverage demo business data with expected counts", async () => {
    const result = await seedDemoBusinessData(db);

    expect(result).toEqual({
      categories: 3,
      tags: 5,
      applications: 4,
      versions: 3,
      deliveries: 3,
      reviews: 1,
      reviewQueueEntries: 1,
      demands: 4,
      collaborators: 2,
      likes: 4,
      comments: 6,
      reports: 2,
      progressUpdates: 2,
      pilots: 1,
      applicationLinks: 1,
      notifications: 6,
      behaviorEvents: 7,
      aggregates: 5,
    });

    const published = await db
      .selectFrom("applications")
      .select(["status", "current_version_id"])
      .where("application_id", "=", APP_PUBLISHED)
      .executeTakeFirstOrThrow();
    expect(published).toEqual({
      status: "published",
      current_version_id: VERSION_PUBLISHED,
    });

    const review = await db
      .selectFrom("application_reviews")
      .select(["decision"])
      .where("application_version_id", "=", VERSION_PUBLISHED)
      .executeTakeFirstOrThrow();
    expect(review.decision).toBe("approve");

    const deliveries = await db
      .selectFrom("application_deliveries")
      .select("channel")
      .where("application_id", "=", APP_PUBLISHED)
      .orderBy("channel")
      .execute();
    expect(deliveries.map((row) => row.channel)).toEqual([
      "desktop",
      "mobile",
      "web",
    ]);

    const inReviewQueue = await db
      .selectFrom("application_review_queue")
      .select(["application_id", "status"])
      .where("application_id", "=", APP_IN_REVIEW)
      .executeTakeFirstOrThrow();
    expect(inReviewQueue.status).toBe("available");

    const merged = await db
      .selectFrom("ai_demands")
      .select(["status", "merged_into_demand_id"])
      .where("demand_id", "=", DEMAND_MERGED)
      .executeTakeFirstOrThrow();
    expect(merged).toEqual({
      status: "merged",
      merged_into_demand_id: DEMAND_PUBLISHED,
    });

    const resolvedReport = await db
      .selectFrom("ai_demand_reports")
      .select(["status", "resolved_by_employee_id"])
      .where("report_id", "=", REPORT_RESOLVED)
      .executeTakeFirstOrThrow();
    expect(resolvedReport).toEqual({
      status: "dismissed",
      resolved_by_employee_id: "DEMO-SUPER-ADMIN",
    });

    const openReportCount = await db
      .selectFrom("ai_demand_reports")
      .select("report_id")
      .where("status", "=", "open")
      .execute();
    expect(openReportCount).toHaveLength(1);
  });

  it("keeps row counts stable when seeded again", async () => {
    await seedDemoBusinessData(db);

    const countOf = async (
      table: "applications" | "ai_demands" | "notifications",
    ) => (await db.selectFrom(table).selectAll().execute()).length;

    expect(await countOf("applications")).toBe(4);
    expect(await countOf("ai_demands")).toBe(4);
    expect(await countOf("notifications")).toBe(6);

    const comments = await db
      .selectFrom("ai_demand_comments")
      .selectAll()
      .execute();
    expect(comments).toHaveLength(4);

    const likes = await db
      .selectFrom("application_likes")
      .selectAll()
      .execute();
    expect(likes).toHaveLength(2);
  });
});
