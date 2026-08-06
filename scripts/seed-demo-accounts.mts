import {
  createDatabase,
  DEMO_ACCOUNT_DEFINITIONS,
  seedDemoAccounts,
} from "../packages/database/src/index.js";
import { PasswordService } from "../packages/server/src/identity/password.service.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed demo accounts");
}

const demoPasswords: Readonly<Record<string, string>> = Object.freeze({
  "DEMO-EMPLOYEE": "Demo-Employee-2026!",
  "DEMO-APP-ADMIN": "Demo-AppAdmin-2026!",
  "DEMO-INNOVATION": "Demo-Innovation-2026!",
  "DEMO-ORG-ADMIN": "Demo-OrgAdmin-2026!",
  "DEMO-SUPER-ADMIN": "Demo-SuperAdmin-2026!",
});

const database = createDatabase(databaseUrl);
const passwords = new PasswordService();

try {
  const passwordHashes: Record<string, string> = {};
  for (const account of DEMO_ACCOUNT_DEFINITIONS) {
    const password = demoPasswords[account.employeeId];
    if (password === undefined) {
      throw new Error(`DEMO_PASSWORD_REQUIRED:${account.employeeId}`);
    }
    passwordHashes[account.employeeId] = await passwords.hashPassword(password);
  }

  const result = await seedDemoAccounts(database, passwordHashes);
  console.log(
    `Demo accounts seeded: departments=${result.departments}, roles=${result.roles}, employees=${result.employees}, memberships=${result.memberships}, roleAssignments=${result.roleAssignments}`,
  );
} finally {
  await database.destroy();
}
