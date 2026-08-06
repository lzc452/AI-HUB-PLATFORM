import type { INestApplication } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

const ROUTE_ARGS_METADATA = "__routeArguments__";
const PARAMTYPES_METADATA = "design:paramtypes";

export interface ConfigureSwaggerOptions {
  enabled: boolean;
}

/**
 * 判断是否启用 API 文档：开发/测试环境默认启用，生产环境仅在显式开启时启用。
 */
export function shouldEnableApiDocs(
  nodeEnv: "development" | "test" | "production",
  enableApiDocs: boolean,
): boolean {
  return nodeEnv !== "production" || enableApiDocs;
}

const API_TAGS: ReadonlyArray<{ name: string; description: string }> =
  Object.freeze([
    { name: "身份与组织", description: "员工、部门、角色、登录与会话管理" },
    {
      name: "应用",
      description: "应用全生命周期：创建、版本、评审、发布与交付",
    },
    { name: "市场目录", description: "已发布应用的目录浏览与搜索" },
    { name: "互动", description: "应用点赞、评分、评论与举报" },
    { name: "通知", description: "站内通知列表与已读标记" },
    { name: "创作者", description: "创作者视角的应用数据" },
    {
      name: "需求",
      description: "创新需求全流程：草稿、评审、认领、协作、试点与合并",
    },
    { name: "分析", description: "分析看板、导出与助手" },
    { name: "健康检查", description: "存活与就绪探针" },
    { name: "指标", description: "Prometheus 指标" },
  ]);

/**
 * 挂载 Swagger UI（/internal/docs）与 OpenAPI JSON（/internal/docs-json）。
 */
export function configureSwagger(
  app: INestApplication,
  options: ConfigureSwaggerOptions,
): void {
  if (!options.enabled) {
    return;
  }

  ensureMethodParamTypes(app);

  const config = new DocumentBuilder()
    .setTitle("AI Hub 平台 API")
    .setDescription(
      "AI Hub 平台内部 API 文档。所有业务接口通过 x-employee-id 与 x-session-id 请求头标识调用者身份；" +
        "错误响应统一为 RFC 7807 Problem Details 格式。",
    )
    .setVersion("1.0");

  for (const tag of API_TAGS) {
    config.addTag(tag.name, tag.description);
  }

  const document = SwaggerModule.createDocument(app, config.build());
  SwaggerModule.setup("internal/docs", app, document);
}

/**
 * esbuild 转译不会为控制器方法发射 design:paramtypes 元数据（tsc 构建则正常）。
 * 这里为缺失的控制器方法补齐占位参数类型，避免 Swagger 参数探测失败；
 * 请求体/查询参数/请求头均已通过 @ApiBody/@ApiQuery/@ApiHeader 显式声明。
 */
function ensureMethodParamTypes(app: INestApplication): void {
  const modulesContainer = app.get(ModulesContainer);
  for (const moduleRef of modulesContainer.values()) {
    for (const controller of moduleRef.controllers.values()) {
      const metatype = controller.metatype;
      if (metatype === undefined || metatype === null) {
        continue;
      }
      const prototype = metatype.prototype as Record<string, unknown>;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const routeArgs = Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          metatype,
          methodName,
        );
        if (routeArgs === undefined) {
          continue;
        }
        const existingTypes = Reflect.getMetadata(
          PARAMTYPES_METADATA,
          prototype,
          methodName,
        );
        if (existingTypes !== undefined) {
          continue;
        }
        const maxIndex = Math.max(
          0,
          ...Object.values(routeArgs as Record<string, { index: number }>).map(
            (parameter) => parameter.index,
          ),
        );
        Reflect.defineMetadata(
          PARAMTYPES_METADATA,
          new Array(maxIndex + 1).fill(Object),
          prototype,
          methodName,
        );
      }
    }
  }
}
