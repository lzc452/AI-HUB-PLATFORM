// 壳层与图标 DOM 几何探针：实测 Header/Sidebar/菜单图标/详情 Modal 的边界框。
// 运行环境：本地 Playwright 1.57 + Chromium 143（headless，deviceScaleFactor=1）。
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const baseUrl = process.env.V1_BASE_URL ?? "http://127.0.0.1:8080";
const outPath = ".verify/v1/browser/shell-icon-probe.json";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1672, height: 941 },
});
const page = await context.newPage();
page.setDefaultNavigationTimeout(20_000);
page.setDefaultTimeout(20_000);

await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
await page.getByLabel("工号 / 邮箱").fill("DEMO-SUPER-ADMIN");
await page.getByLabel("密码").fill("Demo-SuperAdmin-2026!");
await page.getByRole("button", { name: /^登\s*录/ }).click();
await page.waitForURL("**/marketplace", { timeout: 20_000 });

const result = {};

function roundedRect(box) {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

async function captureShell(pageKey) {
  result[pageKey] = await page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    const menuItems = [...document.querySelectorAll(".ant-menu-item")].map(
      (item) => {
        const icon = item.querySelector(".anticon");
        const title = item.querySelector(".ant-menu-title-content");
        return {
          label: title?.textContent?.trim() ?? "",
          item: rect(item),
          icon: rect(icon),
        };
      },
    );
    return {
      header: rect(document.querySelector("header.ant-layout-header")),
      sider: rect(document.querySelector("aside.ant-layout-sider")),
      menuItems,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
}

await page.goto(`${baseUrl}/marketplace`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1_600);
await captureShell("marketplace");

await page.goto(`${baseUrl}/organization`, { waitUntil: "domcontentloaded" });
await page
  .locator(".ant-table-row")
  .first()
  .waitFor({ state: "visible", timeout: 15_000 })
  .catch(() => undefined);
await captureShell("organization");

const editButton = page.getByRole("button", { name: /^编辑\s*/ }).first();
if ((await editButton.count()) > 0) {
  let clickError = null;
  try {
    await editButton.click({ timeout: 5_000 });
  } catch (error) {
    clickError = String(error).split("\n")[0];
  }
  await page.waitForTimeout(1_200);
  const modalSnapshot = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll(".ant-modal")];
    const roots = document.querySelectorAll(".ant-modal-root, .ant-modal-wrap");
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].map(
      (element) => ({
        className: element.className,
        ariaLabel: element.getAttribute("aria-label"),
        width: Math.round(element.getBoundingClientRect().width),
      }),
    );
    const round = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    const visible = candidates.filter(
      (element) => element.getBoundingClientRect().width > 0,
    );
    const modal = visible[0] ?? candidates[0] ?? null;
    const body = document.querySelector(
      ".ant-modal-content, .ant-modal-inner, .ant-modal-body",
    );
    return {
      candidateCount: candidates.length,
      visibleCount: visible.length,
      wrapCount: roots.length,
      dialogs,
      modal: round(modal),
      content: round(body),
    };
  });
  result["organization-user-detail-modal"] = {
    ...modalSnapshot,
    clickError,
  };
} else {
  result["organization-user-detail-modal"] = {
    candidateCount: 0,
    visibleCount: 0,
    editButtonCount: 0,
  };
}

await browser.close();
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
