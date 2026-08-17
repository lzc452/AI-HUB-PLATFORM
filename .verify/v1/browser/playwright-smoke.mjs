// V1 浏览器管线冒烟：启动 Chromium，访问重建后的登录页并保存截图。
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.V1_BASE_URL ?? "http://127.0.0.1:8080";
const outDir = new URL("./", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
const title = await page.title();
const heading = await page
  .locator("h1, h2")
  .first()
  .textContent()
  .catch(() => "");
await page.screenshot({ path: `${outDir}/smoke-login.png` });

const summary = {
  title,
  heading: heading?.trim() ?? "",
  url: page.url(),
  consoleErrors,
  screenshot: `${outDir}/smoke-login.png`,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

await browser.close();
