// 设计图结构边缘检测：提取 Header 底边与 Sidebar 右边界，作为像素级测量基准。
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const designRoot = "packages/ui/src";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "应用市场.png",
      "数据看板.png",
      "系统安全.png",
      "组织管理.png",
      "站内通知.png",
      "创新广场.png",
      "审核工作台.png",
      "应用管理.png",
      "AI助手.png",
    ];

function grayscale(png) {
  const gray = new Float32Array(png.width * png.height);
  for (let i = 0; i < png.data.length; i += 4) {
    gray[i >> 2] =
      png.data[i] * 0.299 + png.data[i + 1] * 0.587 + png.data[i + 2] * 0.114;
  }
  return { gray, width: png.width, height: png.height };
}

function rowEnergy(image, xFrom, xTo) {
  const rows = [];
  for (let y = 0; y < image.height - 1; y += 1) {
    let energy = 0;
    for (let x = xFrom; x < Math.min(xTo, image.width - 1); x += 1) {
      energy += Math.abs(
        image.gray[y * image.width + x] - image.gray[(y + 1) * image.width + x],
      );
    }
    rows.push({ y, energy });
  }
  return rows.sort((a, b) => b.energy - a.energy);
}

function columnEnergy(image, yFrom, yTo) {
  const cols = [];
  for (let x = 0; x < image.width - 1; x += 1) {
    let energy = 0;
    for (let y = yFrom; y < Math.min(yTo, image.height - 1); y += 1) {
      energy += Math.abs(
        image.gray[y * image.width + x] - image.gray[y * image.width + x + 1],
      );
    }
    cols.push({ x, energy });
  }
  return cols.sort((a, b) => b.energy - a.energy);
}

for (const file of files) {
  const png = PNG.sync.read(readFileSync(`${designRoot}/${file}`));
  const image = grayscale(png);
  const rows = rowEnergy(image, 60, png.width - 40).filter(
    (row) => row.y < 260,
  );
  const cols = columnEnergy(image, 80, Math.min(700, png.height - 40)).filter(
    (col) => col.x < 520,
  );
  process.stdout.write(
    `${JSON.stringify({
      file,
      size: `${png.width}x${png.height}`,
      topRowEdges: rows.slice(0, 8),
      topColEdges: cols.slice(0, 8),
    })}\n`,
  );
}
