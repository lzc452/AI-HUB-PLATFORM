// 流程 B 浏览器闭环：互动 → 官方回复 → 反馈处理 → 员工回看 → 隐藏/恢复。
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.V1_BASE_URL ?? "http://127.0.0.1:8080";
const outDir = new URL("./flow-b/", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
mkdirSync(outDir, { recursive: true });

const appId = "10000000-0000-4000-8000-000000000001";
const suffix = Date.now().toString().slice(-6);
const commentText = `浏览器流程B评论-${suffix}`;
const replyText = `官方回复-${suffix}`;
const feedbackText = `浏览器流程B反馈-${suffix}`;
const resolutionText = `已排期处理-${suffix}`;

const roles = {
  "DEMO-EMPLOYEE": "Demo-Employee-2026!",
  "DEMO-APP-ADMIN": "Demo-AppAdmin-2026!",
  "DEMO-SUPER-ADMIN": "Demo-SuperAdmin-2026!",
};

async function login(page, employeeId, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("工号 / 邮箱").fill(employeeId);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page.waitForURL("**/marketplace", { timeout: 20_000 });
}

async function openReviews(page) {
  await page.goto(`${baseUrl}/marketplace/${appId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2_200);
  await page.getByRole("tab", { name: "评价管理" }).click();
  await page.waitForTimeout(2_500);
}

function attachCollectors(page) {
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
  return { consoleErrors, http4xx };
}

const browser = await chromium.launch({ headless: true });
const evidence = {};

// 1. 员工互动
{
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  const collectors = attachCollectors(page);
  await login(page, "DEMO-EMPLOYEE", roles["DEMO-EMPLOYEE"]);
  await page.goto(`${baseUrl}/marketplace/${appId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1_500);

  const likeButton = page.getByRole("button", { name: /点赞/ });
  const likeBefore = await likeButton.textContent();
  await likeButton.click();
  await page.waitForTimeout(1_000);
  const likeAfterLike = await page
    .getByRole("button", { name: /点赞/ })
    .textContent();
  await page.getByRole("button", { name: /点赞/ }).click();
  await page.waitForTimeout(1_000);
  const likeAfterUnlike = await page
    .getByRole("button", { name: /点赞/ })
    .textContent();

  const rateControl = page.locator('[aria-label="为应用评分"]');
  await rateControl.focus();
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.waitForTimeout(1_200);
  const ratingStars = await page
    .locator('[aria-label="为应用评分"] .ant-rate-star-full')
    .count();

  await page.getByRole("tab", { name: "评价管理" }).click();
  await page.waitForTimeout(1_200);
  await page.getByPlaceholder("分享你的使用体验或提出问题…").fill(commentText);
  await page.getByRole("button", { name: "发表评论" }).click();
  await page.waitForTimeout(1_200);

  await page.getByPlaceholder("告诉我们哪里可以做得更好…").fill(feedbackText);
  await page.getByRole("button", { name: "提交反馈" }).click();
  await page.waitForTimeout(1_200);

  const feedbackStatus = await page
    .locator("div", { hasText: feedbackText })
    .first()
    .getByText(/待处理|处理中|已解决|已关闭/)
    .textContent()
    .catch(() => "");

  await page.screenshot({ path: `${outDir}/employee-interactions.png` });
  evidence.employee = {
    likeBefore,
    likeAfterLike,
    likeAfterUnlike,
    ratingStars,
    commentVisible: (await page.getByText(commentText).count()) > 0,
    feedbackVisible: (await page.getByText(feedbackText).count()) > 0,
    feedbackStatus: feedbackStatus?.trim() ?? "",
    consoleErrors: collectors.consoleErrors,
    http4xx: [...collectors.http4xx],
  };
  await context.close();
}

// 2. 所有者官方回复 + 反馈处理
{
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  const collectors = attachCollectors(page);
  await login(page, "DEMO-APP-ADMIN", roles["DEMO-APP-ADMIN"]);
  await openReviews(page);

  const commentCard = page
    .locator("div.rounded-xl.border")
    .filter({ hasText: commentText })
    .first();
  await commentCard.waitFor({ timeout: 20_000 });
  const replyButtonCount = await commentCard
    .getByRole("button", { name: /^回\s*复\s/ })
    .count();
  await commentCard
    .getByRole("button", { name: /^回\s*复\s/ })
    .first()
    .click();
  await page.getByLabel("官方回复内容").fill(replyText);
  await page.getByRole("button", { name: "发送回复" }).click();
  await page.waitForTimeout(1_200);

  const feedbackCard = page
    .locator("div.rounded-lg.border")
    .filter({ hasText: feedbackText })
    .first();
  await feedbackCard.getByRole("combobox", { name: "反馈处理状态" }).click();
  await page.locator('.ant-select-item-option[title="已解决"]').click();
  await feedbackCard.getByLabel("反馈处理说明").fill(resolutionText);
  await feedbackCard.getByRole("button", { name: /^保\s*存$/ }).click();
  await page.waitForTimeout(1_200);

  await page.screenshot({ path: `${outDir}/owner-handling.png` });
  evidence.owner = {
    replyButtonCount,
    replyVisible: (await page.getByText(replyText).count()) > 0,
    officialReplyTagVisible: (await page.getByText("官方回复").count()) > 0,
    resolutionVisible: (await page.getByText(resolutionText).count()) > 0,
    consoleErrors: collectors.consoleErrors,
    http4xx: [...collectors.http4xx],
  };
  await context.close();
}

// 3. 员工回看结果
{
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  const collectors = attachCollectors(page);
  await login(page, "DEMO-EMPLOYEE", roles["DEMO-EMPLOYEE"]);
  await openReviews(page);

  const statusCell = page.locator("div", { hasText: feedbackText }).first();
  const resolvedVisible = (await statusCell.getByText("已解决").count()) > 0;
  await page.screenshot({ path: `${outDir}/employee-revisited.png` });
  evidence.employeeRevisited = {
    replyVisible: (await page.getByText(replyText).count()) > 0,
    resolvedVisible,
    consoleErrors: collectors.consoleErrors,
    http4xx: [...collectors.http4xx],
  };
  await context.close();
}

// 4. 管理员隐藏与恢复
{
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20_000);
  page.setDefaultTimeout(20_000);
  const collectors = attachCollectors(page);
  await login(page, "DEMO-SUPER-ADMIN", roles["DEMO-SUPER-ADMIN"]);
  await openReviews(page);

  const commentCard = page
    .locator("div.rounded-xl.border")
    .filter({ hasText: commentText })
    .first();
  await commentCard.waitFor({ timeout: 20_000 });
  await commentCard.getByRole("button", { name: /隐\s*藏/ }).click();
  await page.waitForTimeout(1_200);
  const hiddenTextVisible =
    (await page.getByText("该评论已被管理员隐藏").count()) > 0;
  await page
    .locator("div.rounded-xl.border")
    .filter({ hasText: "该评论已被管理员隐藏" })
    .first()
    .getByRole("button", { name: /恢\s*复/ })
    .click();
  await page.waitForTimeout(1_200);
  const restoredTextVisible = (await page.getByText(commentText).count()) > 0;
  await page.screenshot({ path: `${outDir}/moderator-hide-restore.png` });

  evidence.moderation = {
    hiddenTextVisible,
    restoredTextVisible,
    consoleErrors: collectors.consoleErrors,
    http4xx: [...collectors.http4xx],
  };
  await context.close();
}

await browser.close();
writeFileSync(
  `${outDir}/flow-b-evidence.json`,
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
