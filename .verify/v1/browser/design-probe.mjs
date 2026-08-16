// 设计图像素取样：校准结构检测阈值。
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const files = process.argv[2]
  ? [process.argv[2]]
  : [
      "packages/ui/src/应用市场.png",
      "packages/ui/src/数据看板.png",
      "packages/ui/src/系统安全.png",
      "packages/ui/src/登录页面.png",
    ];

function px(png, x, y) {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

function isBorderColor([r, g, b], target, tolerance = 4) {
  return (
    Math.abs(r - target[0]) <= tolerance &&
    Math.abs(g - target[1]) <= tolerance &&
    Math.abs(b - target[2]) <= tolerance
  );
}

function measureChrome(png) {
  const boundaryCandidates = [];
  for (let y = 300; y < Math.min(700, png.height); y += 25) {
    let runStart = -1;
    for (let x = 40; x < Math.min(560, png.width); x += 1) {
      const [r, g, b] = px(png, x, y);
      const nonWhite = r < 250 || g < 250 || b < 250;
      if (nonWhite && runStart === -1) runStart = x;
      if (!nonWhite && runStart !== -1) {
        if (x - runStart >= 8) boundaryCandidates.push({ y, x: runStart });
        runStart = -1;
      }
    }
  }
  const boundary =
    boundaryCandidates.length === 0
      ? null
      : boundaryCandidates
          .map((candidate) => candidate.x)
          .sort((a, b) => a - b)[Math.floor(boundaryCandidates.length / 2)];
  const headerCandidates = [];
  if (boundary !== null) {
    for (const x of [boundary + 40, boundary + 120, boundary + 200]) {
      if (x >= png.width - 80) continue;
      let runStart = -1;
      for (let y = 0; y < Math.min(160, png.height); y += 1) {
        const [r, g, b] = px(png, x, y);
        const nonWhite = r < 250 || g < 250 || b < 250;
        if (nonWhite && runStart === -1) runStart = y;
        if (!nonWhite && runStart !== -1) {
          if (y - runStart >= 4) headerCandidates.push({ x, y: runStart });
          runStart = -1;
        }
      }
    }
  }
  const header =
    headerCandidates.length === 0
      ? null
      : Math.min(...headerCandidates.map((candidate) => candidate.y));
  return { boundary, header, boundaryCandidates, headerCandidates };
}

for (const file of files) {
  const png = PNG.sync.read(readFileSync(file));
  const lightBorderRuns = [];
  // 竖直浅边框 #e2e8f0：寻找侧边栏右边界
  for (let y = 250; y < Math.min(700, png.height); y += 50) {
    let start = -1;
    for (let x = 40; x < Math.min(600, png.width); x += 1) {
      const isBorder = isBorderColor(px(png, x, y), [226, 232, 240]);
      if (isBorder && start === -1) start = x;
      if (!isBorder && start !== -1) {
        lightBorderRuns.push({ y, x: start, length: x - start });
        start = -1;
      }
    }
  }
  // 水平浅边框：寻找 Header 底边
  for (let x = 300; x < Math.min(1000, png.width); x += 150) {
    let start = -1;
    for (let y = 0; y < Math.min(200, png.height); y += 1) {
      const isBorder = isBorderColor(px(png, x, y), [226, 232, 240]);
      if (isBorder && start === -1) start = y;
      if (!isBorder && start !== -1) {
        lightBorderRuns.push({ x, y: start, length: y - start });
        start = -1;
      }
    }
  }
  const samples = {
    topLeft: px(png, 5, 5),
    topMid: px(png, Math.floor(png.width / 2), 5),
    y50x5: px(png, 5, 50),
    y70x5: px(png, 5, 70),
    y100x400: px(png, 400, 100),
    y120x400: px(png, 400, 120),
    y400x400: px(png, 400, 400),
    bottomRight: px(png, png.width - 20, png.height - 20),
  };
  process.stdout.write(
    `${file} ${png.width}x${png.height}\nchrome=${JSON.stringify(measureChrome(png))}\n`,
  );
}
