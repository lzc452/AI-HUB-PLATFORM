import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

// 专用配置（仅用于 input-validation.e2e-spec.ts）：
// 用 swc 替代默认 esbuild 做 TS 转译，并开启 decoratorMetadata，
// 这样 tsc 风格 design:paramtypes 装饰器元数据会被保留，NestJS 的 ValidationPipe
// 才能识别 @Query()/@Body() 的 DTO 类型并真正执行校验（esbuild 会剥离该元数据，
// 导致管道在 vitest 下跳过校验——这是测试环境假象，非生产逻辑问题）。
export default defineConfig({
  test: {
    globals: true,
    include: ["test/input-validation.e2e-spec.ts"],
    exclude: ["test/reset-database.ts"],
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true, dynamicImport: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: "es2022",
        keepClassNames: true,
      },
    }),
  ],
});
