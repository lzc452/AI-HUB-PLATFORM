import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 增强器（filter / guard / interceptor）构造依赖必须显式声明注入方式。
 *
 * ## 为什么需要这条静态约束
 *
 * 控制器用**类引用**挂增强器时（`@UseFilters(LlmGatewayExceptionFilter)`、
 * `@UseGuards(ApiKeyGuard)`），Nest 按 `design:paramtypes` 反射出的类型解析构造依赖。
 * 如果某个参数是 interface（例如 pino 的 `Logger`，运行时就是 `Object`）而既没有
 * `@Inject(token)` 也没有 `@Optional()`，生产启动会直接抛
 * 「Nest can't resolve dependencies of the ...」——**整个 API 起不来**。
 *
 * 而测试环境抓不到：vitest 走 esbuild，**不产出 `design:paramtypes`**，
 * 参数不参与注入解析。于是「测试全绿、生产启动失败」。真实案例见
 * `llm-gateway.exception.filter.ts` 的 `constructor(@Optional() logger?)` 注释。
 *
 * 因此这里做静态检查：只要参数存在，就必须自带 `@Optional(` 或 `@Inject(`。
 */

const SOURCE_DIR = new URL(".", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/u,
  "$1",
);

function enhancerSources(): Array<{ name: string; source: string }> {
  return readdirSync(SOURCE_DIR)
    .filter(
      (file) =>
        file.endsWith(".ts") &&
        !file.endsWith(".spec.ts") &&
        !file.endsWith(".test.ts"),
    )
    .map((file) => ({
      name: file,
      source: readFileSync(join(SOURCE_DIR, file), "utf8"),
    }))
    .filter(
      ({ source }) =>
        source.includes("implements ExceptionFilter") ||
        source.includes("implements CanActivate") ||
        source.includes("implements NestInterceptor"),
    );
}

/** 取 constructor 的参数列表文本（public constructor(...) 到配对的右括号）。 */
function constructorParams(source: string): string | null {
  const start = source.search(/constructor\s*\(/u);
  if (start === -1) return null;
  const openIndex = source.indexOf("(", start);
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  return null;
}

/** 去注释：参数里的 JSDoc/行注释含逗号，会干扰按逗号切分。 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

/** 按顶层逗号切分参数（参数里没有嵌套泛型/函数类型，够用且好读）。 */
function splitParams(params: string): string[] {
  return stripComments(params)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

describe("LLM 网关增强器注入元数据", () => {
  it("每个构造参数都显式声明 @Optional/@Inject（否则生产启动即失败）", () => {
    const enhancers = enhancerSources();
    expect(enhancers.length).toBeGreaterThanOrEqual(2);

    for (const { name, source } of enhancers) {
      const params = constructorParams(source);
      expect(params, `${name} 缺少构造函数`).not.toBeNull();
      for (const param of splitParams(params as string)) {
        expect(
          param.includes("@Optional(") || param.includes("@Inject("),
          `${name} 的构造参数「${param.replace(/\s+/gu, " ")}」未声明 @Optional/@Inject：` +
            "测试环境不产出 design:paramtypes 所以能过，生产会启动失败",
        ).toBe(true);
      }
    }
  });
});
