import { existsSync } from "node:fs";
const envPath = ".env";
if (existsSync(envPath)) (process as typeof process & { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(envPath);

import { createDatabase, runMigrations, seedDemoDataset, cleanDemoData } from "@ai-hub/database";
import { sql } from "kysely";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const db = createDatabase(databaseUrl);
  await runMigrations(db);
  const result = await seedDemoDataset(db, {
    anchorDate: new Date(),
    mode: "upsert",
    domains: ["identity", "application", "catalog"],
  });
  console.log("Demo dataset seeded:", result);

  // Insert development sessions for curl validation
  const sessions = [
    { sessionId: "00000000-0000-0000-0000-00000000cafe", employeeId: "DEMO-APP-ADMIN" },
    { sessionId: "00000000-0000-0000-0000-00000000caff", employeeId: "DEMO-SUPER-ADMIN" },
    { sessionId: "00000000-0000-0000-0000-00000000cafd", employeeId: "DEMO-EMPLOYEE" },
  ];
  for (const s of sessions) {
    await sql`
      insert into user_sessions (session_id, employee_id, device_label, expires_at, revoked_at)
      values (${s.sessionId}, ${s.employeeId}, 'curl', now() + interval '7 days', null)
      on conflict (session_id) do update set
        employee_id = excluded.employee_id,
        device_label = excluded.device_label,
        expires_at = excluded.expires_at,
        revoked_at = excluded.revoked_at
    `.execute(db);
    console.log("Development session created:", s.sessionId, s.employeeId);
  }
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
