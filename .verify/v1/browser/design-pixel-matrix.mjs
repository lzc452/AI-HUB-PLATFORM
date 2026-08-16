// 设计图 vs 运行时 程序化像素偏差矩阵。
// 依据：docs/ui-design/frontend-ui-design.md 的权威规范（Header 56px、Sidebar 220/64px）
// 与 design-pass.json（DOM 实测）、shell-icon-probe.json（DOM 实测）以及原设计 PNG 的逐像素测量。
// 局限：本会话无图像输入，设计 PNG 的文案/图标字形逐像素配对需人工复核，下方如实标注。
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const designRoot = "packages/ui/src";
const spec = { headerHeight: 56, siderWidth: 220, siderCollapsed: 64 };
const pass = JSON.parse(
  readFileSync(".verify/v1/browser/design-pass/design-pass.json", "utf8"),
);
const probe = JSON.parse(
  readFileSync(".verify/v1/browser/shell-icon-probe.json", "utf8"),
);

const pages = [
  { key: "login", design: "登录页面.png", kind: "standalone" },
  { key: "marketplace", design: "应用市场.png", kind: "shell" },
  { key: "app-detail", design: "应用详情.png", kind: "shell" },
  { key: "applications", design: "应用管理.png", kind: "shell" },
  { key: "application-detail", design: "应用管理-应用详情.png", kind: "shell" },
  {
    key: "application-versions",
    design: "应用管理-版本管理.png",
    kind: "shell",
  },
  { key: "application-review", design: "审核工作台.png", kind: "shell" },
  {
    key: "application-delivery",
    design: "应用管理-交付配置.png",
    kind: "shell",
  },
  { key: "innovation", design: "创新广场.png", kind: "shell" },
  { key: "innovation-detail", design: "创新广场-详情.png", kind: "shell" },
  { key: "analytics", design: "数据看板.png", kind: "shell" },
  { key: "organization", design: "组织管理.png", kind: "shell" },
  {
    key: "organization-departments",
    design: "组织管理-部门管理.png",
    kind: "shell",
  },
  {
    key: "organization-roles",
    design: "组织管理-角色管理.png",
    kind: "shell",
  },
  {
    key: "organization-sync",
    design: "组织管理-同步状态.png",
    kind: "shell",
  },
  {
    key: "organization-user-detail",
    design: "组织管理-用户详情.png",
    kind: "modal",
  },
  { key: "security", design: "系统安全.png", kind: "shell" },
  { key: "notifications", design: "站内通知.png", kind: "shell" },
  { key: "notifications-detail", design: "站内通知详情.png", kind: "modal" },
  { key: "creator", design: "创作者中心.png", kind: "shell" },
  { key: "assistant", design: "AI助手.png", kind: "shell" },
];

function loadPng(file) {
  return PNG.sync.read(readFileSync(`${designRoot}/${file}`));
}

function isNonWhite(png, x, y) {
  const i = (png.width * y + x) << 2;
  return png.data[i] < 250 || png.data[i + 1] < 250 || png.data[i + 2] < 250;
}

function isNearWhite(png, x, y) {
  const i = (png.width * y + x) << 2;
  return png.data[i] >= 250 && png.data[i + 1] >= 250 && png.data[i + 2] >= 250;
}

function rowCoverage(png, y) {
  let count = 0;
  const step = Math.max(1, Math.floor(png.width / 400));
  for (let x = 0; x < png.width; x += step) {
    if (isNonWhite(png, x, y)) count += 1;
  }
  return count / Math.floor(png.width / step);
}

function columnCoverage(png, x, yStart, yEnd) {
  let count = 0;
  let total = 0;
  for (let y = yStart; y <= yEnd; y += 1) {
    total += 1;
    if (isNonWhite(png, x, y)) count += 1;
  }
  return { ratio: count / total, count, total };
}

function measureHeader(png) {
  // Header 底部边框：y>=30 起第一条覆盖 ≥75% 宽度的非白扫描线。
  const scale = png.width === 2730 ? 2730 / 1672 : 1;
  for (let y = 30; y <= Math.round(120 * scale); y += 1) {
    if (rowCoverage(png, y) >= 0.75) return y;
  }
  return null;
}

function measureSiderBorder(png, headerBottom) {
  const scale = png.width === 2730 ? 2730 / 1672 : 1;
  const yStart = Math.max(
    headerBottom ?? Math.round(56 * scale),
    Math.round(80 * scale),
  );
  const yEnd = Math.min(png.height - 1, Math.round(900 * scale));
  const xEnd = Math.round(400 * scale);
  for (let x = Math.round(120 * scale); x <= xEnd; x += 1) {
    const { ratio } = columnCoverage(png, x, yStart, yEnd);
    if (ratio >= 0.88) return x;
  }
  return null;
}

function measureModalPanel(png) {
  // Modal 面板：在若干中间行上寻找最宽的近白连续区段（其余区域被遮罩压暗）。
  const rows = [0.42, 0.47, 0.52, 0.57].map((ratio) =>
    Math.round(png.height * ratio),
  );
  const edges = [];
  for (const y of rows) {
    let best = null;
    let start = null;
    for (let x = 0; x < png.width; x += 1) {
      if (isNearWhite(png, x, y)) {
        if (start === null) start = x;
      } else if (start !== null) {
        const run = { start, end: x - 1, length: x - start };
        if (!best || run.length > best.length) best = run;
        start = null;
      }
    }
    if (start !== null) {
      const run = { start, end: png.width - 1, length: png.width - start };
      if (!best || run.length > best.length) best = run;
    }
    if (best && best.length > png.width * 0.3) edges.push(best);
  }
  if (edges.length === 0) return null;
  const left = Math.max(...edges.map((edge) => edge.start));
  const right = Math.min(...edges.map((edge) => edge.end));
  return { left, right, width: right - left + 1 };
}

function measureSidebarIcons(png, siderRight, headerBottom) {
  if (!siderRight || !headerBottom) return [];
  const scale = png.width === 2730 ? 2730 / 1672 : 1;
  const xIconEnd = Math.min(Math.round(52 * scale), siderRight - 1);
  const yStart = headerBottom + 8;
  const yEnd = Math.min(png.height - 1, Math.round(900 * scale));
  // 行占用概貌
  const occupied = new Set();
  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = 8; x < xIconEnd; x += 1) {
      if (isNonWhite(png, x, y)) {
        occupied.add(y);
        break;
      }
    }
  }
  const bands = [];
  let bandStart = null;
  let previous = null;
  for (let y = yStart; y <= yEnd; y += 1) {
    const on = occupied.has(y);
    if (on && bandStart === null) bandStart = y;
    if (!on && bandStart !== null) {
      if (y - 1 - bandStart >= 6) bands.push([bandStart, y - 1]);
      bandStart = null;
    }
    previous = on;
  }
  if (bandStart !== null && yEnd - bandStart >= 6) {
    bands.push([bandStart, yEnd]);
  }
  const icons = [];
  for (const [top, bottom] of bands) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 8; x <= xIconEnd; x += 1) {
        if (isNonWhite(png, x, y)) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }
    if (minX !== Infinity) {
      icons.push({
        top,
        bottom,
        height: bottom - top + 1,
        minX,
        maxX,
        width: maxX - minX + 1,
      });
    }
  }
  return icons;
}

const rows = [];
for (const { key, design, kind } of pages) {
  const live = pass[key];
  const png = loadPng(design);
  const scale = png.width === 2730 ? 2730 / 1672 : 1;
  const headerBottom = measureHeader(png);
  const siderRight = measureSiderBorder(png, headerBottom);
  const modal = kind === "modal" ? measureModalPanel(png) : null;
  const designIcons =
    kind === "shell" ? measureSidebarIcons(png, siderRight, headerBottom) : [];
  const liveGeometry = live?.geometry ?? {};
  rows.push({
    key,
    kind,
    design,
    designSize: [png.width, png.height],
    scale: Number(scale.toFixed(4)),
    designHeaderBottom: headerBottom,
    designSiderRight: siderRight,
    designModal: modal,
    designIcons,
    liveHeaderHeight: liveGeometry.header?.height ?? null,
    liveSiderWidth: liveGeometry.sider?.width ?? null,
    liveMainX: liveGeometry.main?.x ?? null,
    specHeaderHeight: kind === "standalone" ? null : spec.headerHeight,
    specSiderWidth: kind === "standalone" ? null : spec.siderWidth,
    headerDeltaVsLive:
      headerBottom === null || liveGeometry.header == null
        ? null
        : Number(
            (headerBottom / scale - liveGeometry.header.height).toFixed(2),
          ),
    siderDeltaVsLive:
      siderRight === null || liveGeometry.sider == null
        ? null
        : Number((siderRight / scale - liveGeometry.sider.width).toFixed(2)),
  });
}

const liveIcons = (probe.marketplace?.menuItems ?? []).map((item) => ({
  label: item.label,
  width: item.icon?.width ?? null,
  height: item.icon?.height ?? null,
}));
const designMarketIcons =
  rows.find((row) => row.key === "marketplace")?.designIcons ?? [];

const report = {
  generatedAt: new Date().toISOString(),
  spec,
  note: "设计 PNG 的边框/图标测量为程序化像素分析；文案与图标字形之间的逐像素配对仍需人工视觉复核（本会话无图像输入）。",
  liveMarketplaceIcons: liveIcons,
  designMarketplaceIconBands: designMarketIcons,
  modalLive: probe["organization-user-detail-modal"] ?? null,
  rows,
};

writeFileSync(
  ".verify/v1/browser/design-pixel-matrix.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
