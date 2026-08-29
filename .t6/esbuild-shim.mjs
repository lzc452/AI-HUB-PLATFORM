// 沙箱内 esbuild 替换垫片（临时验证设施，非仓库交付物，验证后删除）。
// 真实 esbuild 需要以管道 stdio spawn 二进制服务子进程，被 DSH 沙箱拒绝（EPERM）。
// 本垫片用 TypeScript 编译器 API（纯进程内）实现 vite 实际用到的 transform/formatMessages，
// 并让 build/context 抛出明确错误（vitest node 模式不会调用它们）。
import ts from "typescript";

function extnameOf(sourcefile) {
  const clean = String(sourcefile ?? "input.js").split("?")[0];
  const dot = clean.lastIndexOf(".");
  return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
}

function loaderOf(ext) {
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "ts";
    case "tsx":
      return "tsx";
    default:
      return "js";
  }
}

function transpile(input, options) {
  const sourcefile = options?.sourcefile ?? "input.ts";
  const loader = options?.loader ?? loaderOf(extnameOf(sourcefile));
  const code = typeof input === "string" ? input : Buffer.from(input).toString("utf8");
  if (loader !== "ts" && loader !== "tsx") {
    // js/jsx/css/json/text 等直接透传（Node 24 原生支持现代语法，无需降级）
    return {
      code,
      map: options?.sourcemap
        ? JSON.stringify({
            version: 3,
            sources: [sourcefile],
            sourcesContent: [code],
            names: [],
            mappings: "",
          })
        : null,
      warnings: [],
    };
  }
  const result = ts.transpileModule(code, {
    fileName: sourcefile,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: "preserve",
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      esModuleInterop: true,
      allowJs: true,
      isolatedModules: true,
      verbatimModuleSyntax: false,
      sourceMap: Boolean(options?.sourcemap),
      inlineSources: true,
      importHelpers: false,
      useDefineForClassFields: true,
      skipLibCheck: true,
    },
    reportDiagnostics: false,
  });
  const diagnostics = result.diagnostics ?? [];
  if (diagnostics.length > 0) {
    const errors = diagnostics.map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const location = diagnostic.file && diagnostic.start !== undefined
        ? (() => {
            const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            return { file: diagnostic.file.fileName, line: pos.line + 1, column: pos.character + 1 };
          })()
        : undefined;
      return { text: message, location };
    });
    const error = new Error(errors.map((e) => e.text).join("\n"));
    error.errors = errors;
    throw error;
  }
  return {
    code: result.outputText,
    map: result.sourceMapText ?? null,
    warnings: [],
  };
}

export function transform(input, options) {
  return Promise.resolve().then(() => transpile(input, options));
}

export function transformSync(input, options) {
  return transpile(input, options);
}

export function formatMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return Promise.resolve(list.map((message) => (message?.text != null ? message.text : JSON.stringify(message))));
}

export function formatMessagesSync(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list.map((message) => (message?.text != null ? message.text : JSON.stringify(message)));
}

export async function build() {
  throw new Error("esbuild build 在沙箱垫片中不可用（vite 构建模式未启用）");
}

export function buildSync() {
  throw new Error("esbuild buildSync 在沙箱垫片中不可用");
}

export async function context() {
  throw new Error("esbuild context 在沙箱垫片中不可用（optimizeDeps 未启用）");
}

export async function analyzeMetafile(metafile) {
  return JSON.stringify(metafile, null, 2);
}

export function analyzeMetafileSync(metafile) {
  return JSON.stringify(metafile, null, 2);
}

export async function initialize() {}
export async function stop() {}

export const version = "0.28.1-sandbox-shim";

export default {
  version,
  transform,
  transformSync,
  formatMessages,
  formatMessagesSync,
  build,
  buildSync,
  context,
  analyzeMetafile,
  analyzeMetafileSync,
  initialize,
  stop,
};
