#!/usr/bin/env node
// AI Hub Platform 流程图 → PNG 导出（基于 SVG，2x 高清，解决位图模糊）
// 用法：node docs/flowchart/tools/export-png.mjs
// 依赖：@resvg/resvg-js（已装于托管 Node 工作区 node_modules），通过绝对路径引用以保证解析。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DIAGRAMS } from "./flowcharts-data.mjs";

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(TOOLS_DIR, "..");

// 绝对路径引用托管 node 工作区的 resvg-js（ESM 不读取 NODE_PATH，故显式指定）
const RESVG_URL = pathToFileURL(
  "C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/@resvg/resvg-js/index.js",
).href;
const { Resvg } = await import(RESVG_URL);

const ZOOM = 2; // 2x 导出，避免位图模糊
mkdirSync(OUT_DIR, { recursive: true });

let ok = 0;
for (const d of DIAGRAMS) {
  const svgPath = join(OUT_DIR, d.file + ".svg");
  const pngPath = join(OUT_DIR, d.file + ".png");
  const svg = readFileSync(svgPath, "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: ZOOM },
    background: "white",
    logLevel: "off",
  });
  const png = resvg.render();
  writeFileSync(pngPath, png.asPng());
  ok++;
  console.log(`导出 ${d.file}.png (${ZOOM}x)`);
}
console.log(`完成：共导出 ${ok} 张高清 PNG 到 ${OUT_DIR}`);
