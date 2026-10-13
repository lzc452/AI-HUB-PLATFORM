import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { AuditService } from "../system/security/audit.service.js";
import { KyselyAuditRepository } from "../system/security/audit.repository.js";
import { createApiKeyHasher } from "./api-key.hasher.js";
import { LlmGatewayController } from "./llm-gateway.controller.js";
import {
  API_KEY_HASHER,
  LLM_GATEWAY_API_SERVICE,
  LLM_GATEWAY_SERVICE,
  MODEL_SERVICE_KEY_REPOSITORY,
} from "./llm-gateway.tokens.js";
import { LlmGatewayService } from "./llm-gateway.service.js";
import { ModelServiceKeyController } from "./model-service-key.controller.js";
import {
  KyselyModelServiceKeyRepository,
  type ModelServiceKeyRepository,
} from "./model-service-key.repository.js";
import {
  ModelServiceKeyService,
  type ModelServiceAuditPort,
  type ModelServiceKeyServiceConfig,
} from "./model-service-key.service.js";
import { createVllmUpstream } from "./vllm-upstream.adapter.js";

/**
 * 模型服务模块：控制面（`/internal/model-service`）+ 网关面（`/v1`）。
 *
 * 与平台其他模块一致采用「手工装配 + 令牌导出」：配置由调用方（apps/api）从 RuntimeConfig
 * 传入，模块内不读 `process.env`，这样单测可直接构造服务而不必伪造环境变量。
 *
 * 未配置项的行为是刻意区分的：
 * - 未配 HMAC 密钥 → 控制面可读可清理，但**创建/轮换**与 `/v1` 全部返回明确错误；
 * - 未配上游地址 → 控制面完全正常，`/v1` 返回 503 `gateway_not_configured`。
 * 这样误配置时运维仍能登录控制台排查与清理，而不是整个功能变成黑盒。
 */

export interface LlmGatewayModuleOptions extends ModelServiceKeyServiceConfig {
  /** OpenAI 兼容基址；未配置即视为网关未启用。 */
  upstreamBaseUrl: string | undefined;
  /** 上游整体超时（毫秒）。 */
  upstreamTimeoutMs: number;
}

@Module({})
export class LlmGatewayModule {
  public static register(
    database: Kysely<DatabaseSchema>,
    options: LlmGatewayModuleOptions,
  ): DynamicModule {
    return {
      module: LlmGatewayModule,
      imports: [IdentityModule.register(database)],
      controllers: [ModelServiceKeyController, LlmGatewayController],
      providers: buildProviders(
        new KyselyModelServiceKeyRepository(database),
        new AuditService(new KyselyAuditRepository(database)),
        options,
      ),
      exports: [LLM_GATEWAY_SERVICE, LLM_GATEWAY_API_SERVICE],
    };
  }

  /** 测试装配：直接注入仓储/审计/上游，避免依赖真实数据库与真实 GPU 服务。 */
  public static forTest(input: {
    repository: ModelServiceKeyRepository;
    audit: ModelServiceAuditPort;
    options: LlmGatewayModuleOptions;
    identity: IdentityService;
  }): DynamicModule {
    return {
      module: LlmGatewayModule,
      controllers: [ModelServiceKeyController, LlmGatewayController],
      providers: [
        ...buildProviders(input.repository, input.audit, input.options),
        { provide: IdentityService, useValue: input.identity },
      ],
      exports: [LLM_GATEWAY_SERVICE, LLM_GATEWAY_API_SERVICE],
    };
  }
}

function buildProviders(
  repository: ModelServiceKeyRepository,
  audit: ModelServiceAuditPort,
  options: LlmGatewayModuleOptions,
) {
  const hasher =
    options.hmacSecret === undefined
      ? undefined
      : createApiKeyHasher({
          secret: options.hmacSecret,
          previousSecret: options.hmacSecretPrevious,
        });
  const upstream =
    options.upstreamBaseUrl === undefined
      ? undefined
      : createVllmUpstream({
          baseUrl: options.upstreamBaseUrl,
          timeoutMs: options.upstreamTimeoutMs,
        });

  return [
    {
      provide: LLM_GATEWAY_SERVICE,
      useValue: new ModelServiceKeyService(repository, audit, options),
    },
    {
      provide: LLM_GATEWAY_API_SERVICE,
      useValue: new LlmGatewayService(upstream, repository),
    },
    // 守卫的依赖拆成显式令牌：`@UseGuards(ApiKeyGuard)` 按类解析时 Nest 会自行构造，
    // 依赖必须能通过令牌解析（useValue 注册守卫类本身会因缺少 metatype 而回退成无参构造）。
    { provide: MODEL_SERVICE_KEY_REPOSITORY, useValue: repository },
    { provide: API_KEY_HASHER, useFactory: () => hasher },
  ];
}

export type { ModelServiceAuditPort, ModelServiceKeyRepository };
