// 精确取样：Header 水平边框行与 Sidebar 垂直边框列。
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const designRoot = "packages/ui/src";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["应用市场.png", "数据看板.png", "系统安全.png"];

function px(png, x, y) {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

for (const file of files) {
  const png = PNG.sync.read(readFileSync(`${designRoot}/${file}`));
  const rowSamples = {};
  for (let y = 54; y <= 70; y += 1) {
    rowSamples[y] = [100, 300, 500, 800, 1100, 1400].map((x) => ({
      x,
      rgb: px(png, x, y),
    }));
  }
  const colSamples = {};
  for (let x = 208; x <= 236; x += 2) {
    colSamples[x] = [100, 300, 600, 880].map((y) => ({
      y,
      rgb: px(png, x, y),
    }));
  }
  process.stdout.write(`${JSON.stringify({ file, rowSamples, colSamples })}\n`);
}
