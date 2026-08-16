// 全量设计图几何测量：Header 高度与 Sidebar 宽度（非白像素的稳定边界）。
import { readFileSync, readdirSync } from "node:fs";
import { PNG } from "pngjs";

const designRoot = "packages/ui/src";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(designRoot).filter((name) => name.endsWith(".png"));

function px(png, x, y) {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

function isNonWhite(rgb, threshold = 250) {
  return rgb.some((channel) => channel < threshold);
}

function measure(png) {
  const headerXs = [100, 300, 500, 800, 1100, 1400].filter(
    (x) => x < png.width - 10,
  );
  let headerBottom = null;
  for (let y = 40; y <= 90; y += 1) {
    const nonWhite = headerXs.filter((x) => isNonWhite(px(png, x, y))).length;
    if (nonWhite >= headerXs.length - 1) {
      headerBottom = y;
      break;
    }
  }

  const sidebarYs = [];
  for (let y = 100; y < Math.min(900, png.height); y += 50) sidebarYs.push(y);
  let sidebarRight = null;
  for (let x = 150; x <= 340; x += 1) {
    const nonWhite = sidebarYs.filter((y) => isNonWhite(px(png, x, y))).length;
    if (nonWhite >= sidebarYs.length - 2) {
      sidebarRight = x;
      break;
    }
  }
  return { headerBottom, sidebarRight, width: png.width, height: png.height };
}

const rows = [];
for (const file of files) {
  const png = PNG.sync.read(readFileSync(`${designRoot}/${file}`));
  rows.push({ file, ...measure(png) });
}
process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
