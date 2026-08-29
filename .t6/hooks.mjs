// 沙箱验证预加载钩子（临时设施，非仓库交付物，验证后删除）。
// 1) 把 'esbuild' 解析重定向到基于 TypeScript 编译器 API 的垫片（避免 spawn 服务子进程）；
// 2) 拦截 vite 的 exec("net use") Windows realpath 探测（同样会被沙箱拒绝）。
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const shimUrl = pathToFileURL(path.join(here, "esbuild-shim.mjs")).href;

if (typeof registerHooks !== "function") {
  console.error("[t6-hooks] registerHooks 不可用，无法重定向 esbuild");
} else {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "esbuild") {
        return { url: shimUrl, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

// 拦截 vite 初始化时的 exec("net use")：不实际 spawn，直接回调错误，
// vite 会回退到 fs.realpathSync（无网络映射表）。
const require = createRequire(import.meta.url);
const childProcess = require("node:child_process");
const originalExec = childProcess.exec;
childProcess.exec = function patchedExec(command, ...rest) {
  if (typeof command === "string" && /^(net use|fsutil)\b/.test(command.trim())) {
    const callback = rest.length > 0 && typeof rest[rest.length - 1] === "function"
      ? rest[rest.length - 1]
      : null;
    if (callback !== null) {
      queueMicrotask(() => callback(new Error("sandbox: spawn skipped by t6-hooks")));
    }
    return { on() {}, once() {}, kill() {}, unref() {} };
  }
  return originalExec.call(this, command, ...rest);
};
