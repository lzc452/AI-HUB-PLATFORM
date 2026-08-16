// 流程 A 浏览器补充：恶意样本上传失败 UI + 禁止自审 + 四渠道门禁可见性。
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.V1_BASE_URL ?? "http://127.0.0.1:8080";
const outDir = new URL("./flow-a/", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
mkdirSync(outDir, { recursive: true });

const appOwned = "00000001-0000-4000-8000-000000000008";
const selfReviewApp = "10000000-0000-4000-8000-000000000002";
const otherReviewApp = "90000000-0000-4000-8000-000000000003";
const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("工号 / 邮箱").fill("DEMO-APP-ADMIN");
  await page.getByLabel("密码").fill("Demo-AppAdmin-2026!");
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page.waitForURL("**/marketplace", { timeout: 20_000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1672, height: 941 },
});
const page = await context.newPage();
page.setDefaultNavigationTimeout(20_000);
page.setDefaultTimeout(20_000);
const consoleErrors = [];
const http4xx = new Set();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    http4xx.add(`${response.status()} ${response.url()}`);
  }
});

await login(page);

// 1. 恶意样本上传 → 扫描失败且禁止创建版本
await page.goto(`${baseUrl}/applications/${appOwned}/versions`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(1_800);
await page.getByRole("button", { name: "上传新版本" }).click();
await page.waitForTimeout(800);
await page.locator('.ant-upload input[type="file"]').setInputFiles({
  name: "eicar.com.txt",
  mimeType: "text/plain",
  buffer: Buffer.from(EICAR, "ascii"),
});
await page.waitForTimeout(500);
await page.getByRole("button", { name: "开始上传" }).click();
await page.waitForTimeout(8_000);
const scanError = await page
  .getByText(/扫描失败：/)
  .textContent()
  .catch(() => "");
const createVersionButtonPresent =
  (await page.getByRole("button", { name: "创建版本" }).count()) > 0;
await page.screenshot({ path: `${outDir}/eicar-scan-failed.png` });
const eicarEvidence = {
  scanError: scanError?.trim() ?? "",
  createVersionButtonPresent,
};

// 2. 禁止自审：自己的 in_review 应用领取按钮禁用，他人应用可领取
await page.goto(`${baseUrl}/applications/${selfReviewApp}/review`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(1_800);
const selfClaimDisabled = await page
  .getByRole("button", { name: /领\s*取任务/ })
  .isDisabled();
await page.screenshot({ path: `${outDir}/self-review-disabled.png` });

await page.goto(`${baseUrl}/applications/${otherReviewApp}/review`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(1_800);
const otherClaimDisabled = await page
  .getByRole("button", { name: /领\s*取任务/ })
  .isDisabled();

// 3. 四渠道交付配置可见
await page.goto(`${baseUrl}/applications/${appOwned}/delivery`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(1_800);
const channelTabs = await page
  .getByText(/Web 应用|桌面端|移动端|小程序/)
  .allTextContents();
await page.screenshot({ path: `${outDir}/four-channels.png` });

await browser.close();
const evidence = {
  eicar: eicarEvidence,
  selfReview: { selfClaimDisabled, otherClaimDisabled },
  channels: channelTabs.map((text) => text.trim()).filter(Boolean),
  consoleErrors,
  http4xx: [...http4xx],
};
writeFileSync(
  `${outDir}/flow-a-evidence.json`,
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
