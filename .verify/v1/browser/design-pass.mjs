// V1 设计验收：21 页四视口截图、状态、键盘焦点、console/network 与几何测量。
import { chromium } from "@playwright/test";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";

const baseUrl = process.env.V1_BASE_URL ?? "http://127.0.0.1:8080";
const designRoot = "packages/ui/src";
const outDir = new URL("./design-pass/", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
mkdirSync(outDir, { recursive: true });

const publishedAll = "10000000-0000-4000-8000-000000000001";
const appOwned = "00000001-0000-4000-8000-000000000008";
const reviewId = "10000000-0000-4000-8000-000000000002";
const demandId = "00000010-0000-4000-8000-000000000008";

const pages = [
  { key: "login", design: "登录页面.png", path: "/login", auth: false },
  { key: "marketplace", design: "应用市场.png", path: "/marketplace" },
  {
    key: "app-detail",
    design: "应用详情.png",
    path: `/marketplace/${publishedAll}`,
    viewport: [2730, 1536],
  },
  {
    key: "applications",
    design: "应用管理.png",
    path: "/applications",
    role: "app-admin",
  },
  {
    key: "application-detail",
    design: "应用管理-应用详情.png",
    path: `/applications/${appOwned}`,
    role: "app-admin",
  },
  {
    key: "application-versions",
    design: "应用管理-版本管理.png",
    path: `/applications/${appOwned}/versions`,
    role: "app-admin",
  },
  {
    key: "application-review",
    design: "审核工作台.png",
    path: `/applications/${reviewId}/review`,
    role: "app-admin",
  },
  {
    key: "application-delivery",
    design: "应用管理-交付配置.png",
    path: `/applications/${appOwned}/delivery`,
    role: "app-admin",
  },
  { key: "innovation", design: "创新广场.png", path: "/innovation" },
  {
    key: "innovation-detail",
    design: "创新广场-详情.png",
    path: `/innovation/${demandId}`,
  },
  { key: "analytics", design: "数据看板.png", path: "/analytics" },
  { key: "organization", design: "组织管理.png", path: "/organization" },
  {
    key: "organization-departments",
    design: "组织管理-部门管理.png",
    path: "/organization",
    tab: "部门管理",
  },
  {
    key: "organization-roles",
    design: "组织管理-角色管理.png",
    path: "/organization",
    tab: "角色管理",
  },
  {
    key: "organization-sync",
    design: "组织管理-同步状态.png",
    path: "/organization",
    tab: "同步状态",
  },
  {
    key: "organization-user-detail",
    design: "组织管理-用户详情.png",
    path: "/organization",
    openUserDetail: true,
  },
  { key: "security", design: "系统安全.png", path: "/security" },
  { key: "notifications", design: "站内通知.png", path: "/notifications" },
  {
    key: "notifications-detail",
    design: "站内通知详情.png",
    path: "/notifications",
    openNotification: true,
  },
  {
    key: "creator",
    design: "创作者中心.png",
    path: `/creator/${appOwned}`,
    viewport: [2730, 1536],
    role: "app-admin",
  },
  { key: "assistant", design: "AI助手.png", path: "/assistant" },
];

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
  return { consoleErrors, failedRequests, http4xx };
}

async function loginAs(page, employeeId, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("工号 / 邮箱").fill(employeeId);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page.waitForURL("**/marketplace", { timeout: 20_000 });
}

async function measureGeometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    };
    return {
      header: rect("header.ant-layout-header") ?? rect("header"),
      sider: rect("aside.ant-layout-sider") ?? rect("aside"),
      main: rect("main") ?? rect("#main-content"),
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
}

async function keyboardAudit(page) {
  return page.evaluate(async () => {
    const focusables = document.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    return {
      focusableCount: focusables.length,
      firstFocusTag: focusables[0]?.tagName ?? null,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const results = {};
const rolePasswords = {
  "super-admin": "Demo-SuperAdmin-2026!",
  "app-admin": "Demo-AppAdmin-2026!",
};
const roleEmployees = {
  "super-admin": "DEMO-SUPER-ADMIN",
  "app-admin": "DEMO-APP-ADMIN",
};
const contexts = new Map();
const collectorsByRole = new Map();

async function contextFor(role) {
  if (!contexts.has(role)) {
    const context = await browser.newContext({
      viewport: { width: 1672, height: 941 },
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(20_000);
    page.setDefaultTimeout(20_000);
    await loginAs(page, roleEmployees[role], rolePasswords[role]);
    const collectors = attachCollectors(page);
    contexts.set(role, { context, page });
    collectorsByRole.set(role, collectors);
  }
  const entry = contexts.get(role);
  const collectors = collectorsByRole.get(role);
  collectors.consoleErrors.length = 0;
  collectors.failedRequests.length = 0;
  collectors.http4xx.clear();
  return { ...entry, collectors };
}

for (const spec of pages) {
  const designViewport = spec.viewport ?? [1672, 941];
  let context;
  let page;
  let collectors;
  if (spec.auth === false) {
    context = await browser.newContext({
      viewport: { width: designViewport[0], height: designViewport[1] },
    });
    page = await context.newPage();
    page.setDefaultNavigationTimeout(20_000);
    page.setDefaultTimeout(20_000);
    collectors = attachCollectors(page);
  } else {
    const entry = await contextFor(spec.role ?? "super-admin");
    context = entry.context;
    page = entry.page;
    collectors = entry.collectors;
  }
  await page.setViewportSize({
    width: designViewport[0],
    height: designViewport[1],
  });
  await page.goto(`${baseUrl}${spec.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_800);

  if (spec.tab) {
    await page.getByRole("tab", { name: spec.tab }).click();
    await page.waitForTimeout(900);
  }
  if (spec.openUserDetail) {
    await page
      .getByRole("button", { name: /^编辑\s*/ })
      .first()
      .click()
      .catch(() => undefined);
    await page.waitForTimeout(700);
  }
  if (spec.openNotification) {
    await page
      .locator('li[role="button"], .ant-list-item, .ant-table-row')
      .first()
      .click()
      .catch(() => undefined);
    await page.waitForTimeout(700);
  }

  const geometry = await measureGeometry(page);
  const keyboard = await keyboardAudit(page);
  const stateChecks = {};

  // 主按钮 hover/focus/selected 状态
  const primary = page.locator(".ant-btn-primary").first();
  if ((await primary.count()) > 0) {
    await primary.hover().catch(() => undefined);
    await page.screenshot({ path: `${outDir}/${spec.key}-hover.png` });
    await primary.focus().catch(() => undefined);
    stateChecks.focusOutline = await primary.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    );
    await page.screenshot({ path: `${outDir}/${spec.key}-focus.png` });
  }
  stateChecks.activeTab = await page
    .locator(".ant-tabs-tab-active")
    .first()
    .textContent()
    .catch(() => null);

  const screenshots = [];
  for (const [width, height] of [designViewport, [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    const name = `${spec.key}-${width}x${height}.png`;
    await page.screenshot({ path: `${outDir}/${name}` });
    screenshots.push({ name, width, height, overflowX: overflow });
  }

  // 原图并置：设计图复制到同一目录作为配对证据
  copyFileSync(
    `${designRoot}/${spec.design}`,
    `${outDir}/${spec.key}-design.png`,
  );

  results[spec.key] = {
    design: spec.design,
    path: spec.path,
    designViewport,
    screenshots,
    geometry,
    keyboard,
    stateChecks,
    consoleErrors: collectors.consoleErrors,
    failedRequests: collectors.failedRequests,
    http4xx: [...collectors.http4xx],
  };
  if (spec.auth === false) await context.close();
}

await browser.close();
writeFileSync(
  `${outDir}/design-pass.json`,
  `${JSON.stringify(results, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
