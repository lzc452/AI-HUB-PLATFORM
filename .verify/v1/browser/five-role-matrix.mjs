// V1 五角色浏览器矩阵：菜单、路由、401/403、资源归属、受众隔离与禁止自审。
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.V1_BASE_URL ?? "http://127.0.0.1:8080";
const outDir = new URL("./matrix/", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
mkdirSync(outDir, { recursive: true });

const roles = {
  "DEMO-EMPLOYEE": "Demo-Employee-2026!",
  "DEMO-APP-ADMIN": "Demo-AppAdmin-2026!",
  "DEMO-INNOVATION": "Demo-Innovation-2026!",
  "DEMO-ORG-ADMIN": "Demo-OrgAdmin-2026!",
  "DEMO-SUPER-ADMIN": "Demo-SuperAdmin-2026!",
};

const targets = {
  publishedAll: "10000000-0000-4000-8000-000000000001",
  innovationOnly: "90000000-0000-4000-8000-000000000001",
  archived: "90000000-0000-4000-8000-000000000002",
  selfReview: "10000000-0000-4000-8000-000000000002",
  otherReview: "90000000-0000-4000-8000-000000000003",
};

async function login(page, employeeId, password) {
  process.stdout.write(`[login] ${employeeId}\n`);
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("工号 / 邮箱").fill(employeeId);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page.waitForURL("**/marketplace", { timeout: 20_000 });
}

function attachCollectors(page) {
  const consoleErrors = [];
  const failedRequests = [];
  const http4xx = new Set();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      http4xx.add(`${response.status()} ${response.url()}`);
    }
  });
  return { consoleErrors, failedRequests, http4xx: [...http4xx] };
}

async function firstHeading(page) {
  return (
    (await page
      .locator("h1, h2")
      .first()
      .textContent()
      .catch(() => "")) ?? ""
  ).trim();
}

async function probeRoute(page, path) {
  process.stdout.write(`[probe] ${path}\n`);
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(900);
  const forbidden = (await page.getByText("没有访问权限").count()) > 0;
  const notFound =
    (await page.getByText(/应用不存在或当前员工无权访问/).count()) > 0;
  const resultTitle = await page
    .locator(".ant-result-title")
    .first()
    .textContent()
    .catch(() => null);
  return {
    path,
    status: response?.status() ?? null,
    finalUrl: page.url(),
    heading: await firstHeading(page),
    forbidden,
    notFound,
    resultTitle: resultTitle?.trim() ?? null,
  };
}

async function menuLabels(page) {
  const labels = await page.locator("nav a").allTextContents();
  return labels.map((label) => label.trim()).filter(Boolean);
}

const browser = await chromium.launch({ headless: true });
const matrix = {};

// 401：无会话访问受保护路由应回到登录页
{
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  const collectors = attachCollectors(page);
  const result = await probeRoute(page, "/marketplace");
  matrix["401-unauthenticated"] = {
    ...result,
    consoleErrors: collectors.consoleErrors,
    failedRequests: collectors.failedRequests,
    http4xx: [...collectors.http4xx],
  };
  await context.close();
}

for (const [employeeId, password] of Object.entries(roles)) {
  process.stdout.write(`[role] ${employeeId}\n`);
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  const collectors = attachCollectors(page);
  await login(page, employeeId, password);

  const menus = await menuLabels(page);
  const routes = {};
  for (const path of [
    "/marketplace",
    "/applications",
    "/analytics",
    "/organization",
    "/security",
    "/notifications",
    "/innovation",
    "/assistant",
  ]) {
    routes[path] = await probeRoute(page, path);
  }

  // 受众隔离与 direct-ID
  const directIds = {};
  for (const [kind, id] of Object.entries(targets)) {
    if (!kind.endsWith("Review")) {
      const result = await probeRoute(page, `/marketplace/${id}`);
      directIds[kind] = result;
    }
  }

  await page.goto(`${baseUrl}/marketplace`, { waitUntil: "load" });
  await page.screenshot({ path: `${outDir}/${employeeId}-marketplace.png` });

  matrix[employeeId] = {
    menus,
    routes,
    directIds,
    consoleErrors: collectors.consoleErrors,
    failedRequests: collectors.failedRequests,
    http4xx: [...collectors.http4xx],
  };
  await context.close();
}

// 禁止自审与可认领他人应用：应用管理员视角
{
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  const collectors = attachCollectors(page);
  await login(page, "DEMO-APP-ADMIN", roles["DEMO-APP-ADMIN"]);
  const selfReview = await probeRoute(
    page,
    `/applications/${targets.selfReview}/review`,
  );
  const selfClaimButtons = await page
    .getByRole("button", { name: /认\s*领|领\s*取/ })
    .count();
  const otherReview = await probeRoute(
    page,
    `/applications/${targets.otherReview}/review`,
  );
  const otherClaimButtons = await page
    .getByRole("button", { name: /认\s*领|领\s*取/ })
    .count();
  await page.screenshot({ path: `${outDir}/app-admin-self-review.png` });
  matrix["no-self-review"] = {
    selfReview,
    selfClaimButtons,
    otherReview,
    otherClaimButtons,
    consoleErrors: collectors.consoleErrors,
    failedRequests: collectors.failedRequests,
    http4xx: [...collectors.http4xx],
  };
  await context.close();
}

await browser.close();
writeFileSync(`${outDir}/matrix.json`, `${JSON.stringify(matrix, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(matrix, null, 2)}\n`);
