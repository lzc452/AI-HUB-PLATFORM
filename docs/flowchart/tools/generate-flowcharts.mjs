#!/usr/bin/env node
// AI Hub Platform 设计流程图生成器（v2 · 重绘优化版）
// 输出：docs/flowchart/<id>.drawio（draw.io 源文件）与 docs/flowchart/<id>.svg（矢量预览）
// 用法：
//   node docs/flowchart/tools/generate-flowcharts.mjs            # 生成全部
//   node docs/flowchart/tools/generate-flowcharts.mjs --check    # 仅做重叠/越界/穿节点校验
// PNG 由独立脚本 docs/flowchart/tools/export-png.mjs 基于 SVG 以 2x 导出。
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DIAGRAMS } from "./flowcharts-data.mjs";

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(TOOLS_DIR, "..");
const FONT = "Microsoft YaHei, 'Segoe UI', Arial, sans-serif";

// ---------- 形状样式（draw.io 侧，固定字号避免文本溢出） ----------
const DRAWIO_STYLE = {
  actor: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontFamily=Microsoft YaHei;fontSize=13;verticalAlign=middle;",
  process: "rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontFamily=Microsoft YaHei;fontSize=13;verticalAlign=middle;",
  decision: "rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontFamily=Microsoft YaHei;fontSize=13;verticalAlign=middle;",
  start: "ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontFamily=Microsoft YaHei;fontSize=13;verticalAlign=middle;",
  end: "ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontFamily=Microsoft YaHei;fontSize=13;verticalAlign=middle;",
  database: "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=14;fillColor=#e1d5e7;strokeColor=#9673a6;fontFamily=Microsoft YaHei;fontSize=13;verticalAlign=middle;",
  cloud: "shape=cloud;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontFamily=Microsoft YaHei;fontSize=13;verticalAlign=middle;",
  container: "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#999999;dashed=1;verticalAlign=top;fontStyle=1;fontSize=14;fontFamily=Microsoft YaHei;",
  note: "shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=16;fillColor=#fff2cc;strokeColor=#d6b656;fontFamily=Microsoft YaHei;fontSize=12;verticalAlign=middle;",
};

const SHAPE_FILL = {
  actor: "#ffe6cc", process: "#dae8fc", decision: "#fff2cc", start: "#d5e8d4",
  end: "#d5e8d4", database: "#e1d5e7", cloud: "#f8cecc", container: "none", note: "#fff2cc",
};
const SHAPE_STROKE = {
  actor: "#d79b00", process: "#6c8ebf", decision: "#d6b656", start: "#82b366",
  end: "#82b366", database: "#9673a6", cloud: "#b85450", container: "#999999", note: "#d6b656",
};

function escXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "&#10;");
}

// ---------- 文本测量与自动折行（解决字体溢出） ----------
function isCJK(c) {
  const code = c.codePointAt(0);
  return (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef) || (code >= 0x3000 && code <= 0x303f);
}
function charWidth(ch, fs) {
  if (ch === " ") return fs * 0.4;
  if (isCJK(ch)) return fs;
  if (".,;:!?()[]{}<>/=+-_*|'\"".includes(ch)) return fs * 0.5;
  return fs * 0.56;
}
function textWidth(str, fs) {
  let w = 0;
  for (const ch of str) w += charWidth(ch, fs);
  return w;
}
function tokenize(para) {
  const toks = [];
  let buf = "";
  for (const ch of para) {
    if (ch === " ") {
      if (buf) { toks.push(buf); buf = ""; }
      toks.push(" ");
      continue;
    }
    if (isCJK(ch)) {
      if (buf) { toks.push(buf); buf = ""; }
      toks.push(ch);
    } else buf += ch;
  }
  if (buf) toks.push(buf);
  return toks;
}
function wrapParagraph(para, maxW, fs) {
  const toks = tokenize(para);
  const lines = [];
  let cur = "";
  let curW = 0;
  for (const t of toks) {
    if (t === " ") {
      const w = charWidth(" ", fs);
      if (cur && curW + w <= maxW) { cur += " "; curW += w; }
      continue;
    }
    const w = textWidth(t, fs);
    if (cur === "") { cur = t; curW = w; }
    else if (curW + w <= maxW) { cur += t; curW += w; }
    else { lines.push(cur); cur = t; curW = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function wrapLabel(label, maxW, fs) {
  return label.split("\n").flatMap((p) => wrapParagraph(p, maxW, fs));
}
// 为节点计算最佳字号、折行结果与自适应高度（高度不足则增长，避免文本溢出）
function fitNode(n) {
  const [, label, , , w, h, shape] = n;
  const pad = 10;
  const usable = shape === "decision" ? Math.max(w - 56, w * 0.6) : w - 2 * pad;
  const fonts = (shape === "decision" || shape === "note") ? [13, 12, 11] : [13, 12, 11, 10];
  let best = null;
  for (const fs of fonts) {
    const lines = wrapLabel(label, usable, fs);
    const lineH = fs + 6;
    const needed = lines.length * lineH + (shape === "decision" ? 18 : 12);
    if (needed <= h) { best = { fs, lines, lineH, h }; break; }
    if (!best || needed < best.needed) best = { fs, lines, lineH, needed, h: Math.max(h, needed) };
  }
  return best;
}

// ---------- 路由与锚点（解决箭头方向错乱） ----------
function router(sx, sy, sw, sh, tx, ty, tw, th, dir) {
  const scy = sy + sh / 2, tcy = ty + th / 2, scx = sx + sw / 2, tcx = tx + tw / 2;
  let d = dir;
  if (!d) {
    if (tx > sx + sw && Math.abs(tcy - scy) < Math.max(sh, th) * 0.7) d = "right";
    else if (ty > sy + sh) d = "down";
    else if (tx + tw < sx) d = "left";
    else d = "up";
  }
  switch (d) {
    case "right": {
      const exit = [sx + sw, scy], entry = [tx, tcy], midX = (exit[0] + entry[0]) / 2;
      return [exit, [midX, scy], [midX, tcy], entry];
    }
    case "left": {
      const exit = [sx, scy], entry = [tx + tw, tcy], midX = (exit[0] + entry[0]) / 2;
      return [exit, [midX, scy], [midX, tcy], entry];
    }
    case "down": {
      const exit = [scx, sy + sh], entry = [tcx, ty], midY = (exit[1] + entry[1]) / 2;
      return [exit, [scx, midY], [tcx, midY], entry];
    }
    case "up": {
      const exit = [scx, sy], entry = [tcx, ty + th], midY = (exit[1] + entry[1]) / 2;
      return [exit, [scx, midY], [tcx, midY], entry];
    }
  }
}
function borderAnchor(pt, x, y, w, h, tol = 2) {
  const r = x + w, b = y + h;
  if (Math.abs(pt[0] - r) <= tol) return [1, 0.5];
  if (Math.abs(pt[0] - x) <= tol) return [0, 0.5];
  if (Math.abs(pt[1] - b) <= tol) return [0.5, 1];
  if (Math.abs(pt[1] - y) <= tol) return [0.5, 0];
  const cx = x + w / 2, cy = y + h / 2;
  const dx = pt[0] - cx, dy = pt[1] - cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? [1, 0.5] : [0, 0.5];
  return dy > 0 ? [0.5, 1] : [0.5, 0];
}
function edgeAnchors(d, e) {
  const [, fromId, toId, , , waypoints] = e;
  const from = d.nodes.find((n) => n[0] === fromId);
  const to = d.nodes.find((n) => n[0] === toId);
  if (!from || !to) throw new Error("节点缺失：" + fromId + "/" + toId);
  const [, , fx, fy, fw, fh] = from;
  const [, , tx, ty, tw, th] = to;
  const points = waypoints ?? router(fx, fy, fw, fh, tx, ty, tw, th, undefined);
  const first = points[0], last = points[points.length - 1];
  const exit = borderAnchor(first, fx, fy, fw, fh);
  const entry = borderAnchor(last, tx, ty, tw, th);
  return { points, exitX: exit[0], exitY: exit[1], entryX: entry[0], entryY: entry[1] };
}

// ---------- draw.io 渲染 ----------
function diagramToDrawio(d) {
  const [pageW, pageH] = d.page;
  const cells = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];
  for (const n of d.nodes) {
    const [id, label, x, y, w, h, shape] = n;
    const fit = fitNode(n);
    const style = DRAWIO_STYLE[shape];
    const value = fit.lines.join("\n");
    cells.push(
      `<mxCell id="${id}" value="${escXml(value)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${fit.h}" as="geometry" /></mxCell>`,
    );
  }
  for (const e of d.edges) {
    const [id, from, to, label, , waypoints] = e;
    const { points, exitX, exitY, entryX, entryY } = edgeAnchors(d, e);
    let style =
      "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;strokeWidth=2;" +
      `exitX=${exitX};exitY=${exitY};entryX=${entryX};entryY=${entryY};`;
    if (label) style += "fontSize=11;labelBackgroundColor=#ffffff;";
    const pts = waypoints ?? points.slice(1, -1);
    let geo = `<mxGeometry relative="1" as="geometry">`;
    if (pts.length) {
      geo += `<Array as="points">${pts.map((p) => `<mxPoint x="${p[0]}" y="${p[1]}" />`).join("")}</Array>`;
    }
    geo += `</mxGeometry>`;
    cells.push(
      `<mxCell id="${id}" value="${escXml(label ?? "")}" style="${style}" edge="1" parent="1" source="${from}" target="${to}">${geo}</mxCell>`,
    );
  }
  return (
    `<mxfile host="app.diagrams.net" agent="workbuddy" version="24.0.0">` +
    `<diagram id="${d.id}" name="${escXml(d.title)}">` +
    `<mxGraphModel dx="1200" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">` +
    `<root>${cells.join("")}</root>` +
    `</mxGraphModel></diagram></mxfile>`
  );
}

// ---------- SVG 渲染（矢量、清晰） ----------
function svgShapeNode(n) {
  const [id, label, x, y, w, h, shape] = n;
  const fit = fitNode(n);
  const hh = fit.h;
  const fill = SHAPE_FILL[shape], stroke = SHAPE_STROKE[shape];
  const cx = x + w / 2, cy = y + hh / 2;
  const body = [];
  if (shape === "decision") {
    body.push(`<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + hh} ${x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`);
  } else if (shape === "start" || shape === "end") {
    body.push(`<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${hh / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`);
    if (shape === "end") body.push(`<ellipse cx="${cx}" cy="${cy}" rx="${w / 2 - 7}" ry="${hh / 2 - 7}" fill="none" stroke="${stroke}" stroke-width="1.3" />`);
  } else if (shape === "database") {
    const size = 14;
    body.push(
      `<ellipse cx="${cx}" cy="${y + size}" rx="${w / 2}" ry="${size}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
      `<path d="M ${x} ${y + size} L ${x} ${y + hh - size} A ${w / 2} ${size} 0 0 0 ${x + w} ${y + hh - size} L ${x + w} ${y + size}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
      `<path d="M ${x} ${y + size} A ${w / 2} ${size} 0 0 0 ${x + w} ${y + size}" fill="none" stroke="${stroke}" stroke-width="2" />`,
    );
  } else if (shape === "cloud") {
    body.push(
      `<rect x="${x}" y="${y + hh * 0.3}" width="${w}" height="${hh * 0.7}" rx="${hh * 0.28}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
      `<circle cx="${x + w * 0.24}" cy="${y + hh * 0.4}" r="${hh * 0.28}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
      `<circle cx="${x + w * 0.52}" cy="${y + hh * 0.28}" r="${hh * 0.33}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
      `<circle cx="${x + w * 0.8}" cy="${y + hh * 0.42}" r="${hh * 0.25}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
    );
  } else if (shape === "container") {
    body.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-dasharray="7,5" />`,
      `<text x="${x + 14}" y="${y + 26}" font-family="${FONT}" font-size="14" font-weight="bold" fill="#1d2433">${escXml(fit.lines[0])}</text>`,
    );
  } else if (shape === "note") {
    const fold = 18;
    body.push(
      `<polygon points="${x},${y} ${x + w - fold},${y} ${x + w},${y + fold} ${x + w},${y + hh} ${x},${y + hh}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`,
      `<line x1="${x + w - fold}" y1="${y}" x2="${x + w - fold}" y2="${y + fold}" stroke="${stroke}" stroke-width="1.3" />`,
      `<line x1="${x + w - fold}" y1="${y + fold}" x2="${x + w}" y2="${y + fold}" stroke="${stroke}" stroke-width="1.3" />`,
    );
  } else {
    body.push(`<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2" />`);
  }
  if (shape !== "container") {
    const { lines, fs, lineH } = fit;
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    body.push(
      `<text x="${cx}" y="${startY + fs * 0.35}" font-family="${FONT}" font-size="${fs}" fill="#1d2433" text-anchor="middle">` +
        lines.map((ln, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : lineH}">${escXml(ln)}</tspan>`).join("") +
        `</text>`,
    );
  }
  return `<g id="${id}">${body.join("")}</g>`;
}
function svgEdge(e, diagram) {
  const [id, from, to, label, , waypoints] = e;
  const f = diagram.nodes.find((n) => n[0] === from);
  const t = diagram.nodes.find((n) => n[0] === to);
  const [, , fx, fy, fw, fh] = f;
  const [, , tx, ty, tw, th] = t;
  const pts = waypoints ?? router(fx, fy, fw, fh, tx, ty, tw, th, undefined);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const mid = pts[Math.floor(pts.length / 2)];
  let out = `<g id="${id}">`;
  out += `<path d="${path}" fill="none" stroke="#3c4a5e" stroke-width="2" marker-end="url(#arrow)" />`;
  if (label) {
    out += `<text x="${mid[0]}" y="${mid[1] - 7}" font-family="${FONT}" font-size="11" fill="#1d2433" text-anchor="middle" stroke="#ffffff" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${escXml(label)}</text>`;
  }
  out += `</g>`;
  return out;
}
function diagramToSvg(d) {
  const [pageW, pageH] = d.page;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3c4a5e" /></marker></defs>`,
    `<rect width="${pageW}" height="${pageH}" fill="#ffffff" />`,
  ];
  const containerIds = new Set(d.nodes.filter((n) => n[6] === "container").map((n) => n[0]));
  for (const n of d.nodes) if (containerIds.has(n[0])) parts.push(svgShapeNode(n));
  for (const n of d.nodes) if (!containerIds.has(n[0])) parts.push(svgShapeNode(n));
  for (const e of d.edges) parts.push(svgEdge(e, d));
  parts.push(`</svg>`);
  return parts.join("\n");
}

// ---------- 校验（重叠 / 越界 / waypoint 穿节点） ----------
function checkDiagram(d) {
  const rect = (n) => { const [, , x, y, w, h] = n; return { x, y, w, h, r: x + w, b: y + h }; };
  const nodes = d.nodes;
  const isContainer = (n) => n[6] === "container";
  const problems = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = rect(nodes[i]), b = rect(nodes[j]);
      if (!(a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b)) continue;
      // 容器与其内部子节点视为包含关系，不算重叠
      const childInParent =
        (isContainer(nodes[i]) && b.x >= a.x && b.r <= a.r && b.y >= a.y && b.b <= a.b) ||
        (isContainer(nodes[j]) && a.x >= b.x && a.r <= b.r && a.y >= b.y && a.b <= b.b);
      if (childInParent) continue;
      problems.push("重叠 " + nodes[i][0] + " x " + nodes[j][0]);
    }
  const [pw, ph] = d.page;
  for (const n of nodes) {
    const r = rect(n);
    if (r.r > pw + 1 || r.b > ph + 1 || r.x < -1 || r.y < -1) problems.push("越界 " + n[0]);
  }
  for (const e of d.edges) {
    const wp = e[5];
    if (!wp) continue;
    for (const w of wp) {
      for (const n of nodes) {
        if (n[0] === e[1] || n[0] === e[2] || isContainer(n)) continue;
        const r = rect(n);
        if (w[0] > r.x + 2 && w[0] < r.r - 2 && w[1] > r.y + 2 && w[1] < r.b - 2)
          problems.push("边 " + e[0] + " 穿节点 " + n[0] + " (" + w[0] + "," + w[1] + ")");
      }
    }
  }
  return problems;
}

// ---------- 入口 ----------
mkdirSync(OUT_DIR, { recursive: true });
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const check = process.argv.includes("--check");
  let total = 0;
  for (const d of DIAGRAMS) {
    if (check) {
      const probs = checkDiagram(d);
      console.log(d.id + ": " + (probs.length ? probs.length + " 问题 -> " + probs.join("; ") : "OK"));
      total += probs.length;
    } else {
      writeFileSync(join(OUT_DIR, d.file + ".drawio"), diagramToDrawio(d));
      writeFileSync(join(OUT_DIR, d.file + ".svg"), diagramToSvg(d));
    }
  }
  if (check) {
    console.log(total === 0 ? "\n校验通过：无重叠 / 越界 / 穿节点" : "\n校验发现 " + total + " 处问题");
  } else {
    console.log("已生成 " + DIAGRAMS.length + " 张流程图到 " + OUT_DIR);
  }
}

export { DIAGRAMS, diagramToDrawio, diagramToSvg, router, fitNode, checkDiagram };
