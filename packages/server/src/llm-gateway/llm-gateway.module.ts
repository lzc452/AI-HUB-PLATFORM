import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Logger } from "pino";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { AuditService } from "../system/security/audit.service.js";
import { KyselyAuditRepository } from "../system/security/audit.repository.js";
import { createApiKeyHasher } from "./api-key.hasher.js";
import {
  KyselyLlmCallLogRepository,
  type LlmCallLogRepository,
} from "./llm-call-log.repository.js";
import { LlmGatewayController } from "./llm-gateway.controller.js";
import {
  API_KEY_HASHER,
  INVALID_KEY_THROTTLE,
  LLM_CALL_LOG_REPOSITORY,
  LLM_GATEWAY_API_SERVICE,
  LLM_GATEWAY_SERVICE,
  LLM_QUOTA_SERVICE,
  LLM_USAGE_REPOSITORY,
  LLM_USAGE_SERVICE,
  MODEL_SERVICE_KEY_REPOSITORY,
  UPSTREAM_CIRCUIT_BREAKER,
} from "./llm-gateway.tokens.js";
import {
  KyselyLlmUsageRepository,
  type LlmUsageRepository,
} from "./llm-usage.repository.js";
import { ModelServiceUsageController } from "./model-service-usage.controller.js";
import { ModelServiceUsageService } from "./model-service-usage.service.js";
import {
  LlmGatewayService,
  type LlmGatewayServiceOptions,
} from "./llm-gateway.service.js";
import {
  createInvalidKeyThrottle,
  createWeightedFixedWindowCounter,
  LlmQuotaService,
  type QuotaDefaults,
} from "./llm-quota.js";
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
import { createUpstreamCircuitBreaker } from "./upstream-circuit-breaker.js";
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
  /** 流式首 token 超时（毫秒）。 */
  firstTokenTimeoutMs: number;
  /** Key 未单独设置限额时使用的平台默认值。 */
  quotaDefaults: QuotaDefaults;
  /** 熔断阈值与打开时长（默认 5 次 / 30s）。 */
  circuit?: { failureThreshold?: number; openDurationMs?: number };
  /** 旁路问题（台账写失败等）的日志出口。 */
  logger?: Logger | undefined;
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
      controllers: [
        ModelServiceKeyController,
        ModelServiceUsageController,
        LlmGatewayController,
      ],
      providers: buildProviders(
        new KyselyModelServiceKeyRepository(database),
        new AuditService(new KyselyAuditRepository(database)),
        new KyselyLlmCallLogRepository(database),
        new KyselyLlmUsageRepository(database),
        options,
      ),
      exports: [LLM_GATEWAY_SERVICE, LLM_GATEWAY_API_SERVICE],
    };
  }

  /** 测试装配：直接注入仓储/审计/上游，避免依赖真实数据库与真实 GPU 服务。 */
  public static forTest(input: {
    repository: ModelServiceKeyRepository;
    audit: ModelServiceAuditPort;
    callLogs?: LlmCallLogRepository;
    usage?: LlmUsageRepository;
    options: LlmGatewayModuleOptions;
    identity: IdentityService;
  }): DynamicModule {
    return {
      module: LlmGatewayModule,
      controllers: [
        ModelServiceKeyController,
        ModelServiceUsageController,
        LlmGatewayController,
      ],
      providers: [
        ...buildProviders(
          input.repository,
          input.audit,
          input.callLogs ?? emptyCallLogRepository(),
          input.usage ?? emptyUsageRepository(),
          input.options,
        ),
        { provide: IdentityService, useValue: input.identity },
      ],
      exports: [LLM_GATEWAY_SERVICE, LLM_GATEWAY_API_SERVICE],
    };
  }
}

function buildProviders(
  repository: ModelServiceKeyRepository,
  audit: ModelServiceAuditPort,
  callLogs: LlmCallLogRepository,
  usageRepository: LlmUsageRepository,
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
  const quota = new LlmQuotaService({
    counters: createWeightedFixedWindowCounter(),
    callLogs,
    defaults: options.quotaDefaults,
  });
  const breaker = createUpstreamCircuitBreaker(options.circuit);

  const gatewayOptions: LlmGatewayServiceOptions = {
    upstream,
    keyRepository: repository,
    callLogs,
    quota,
    breaker,
    upstreamTimeoutMs: options.upstreamTimeoutMs,
    firstTokenTimeoutMs: options.firstTokenTimeoutMs,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  };

  return [
    {
      provide: LLM_GATEWAY_SERVICE,
      useValue: new ModelServiceKeyService(repository, audit, options),
    },
    {
      provide: LLM_GATEWAY_API_SERVICE,
      useValue: new LlmGatewayService(gatewayOptions),
    },
    // 守卫的依赖拆成显式令牌：`@UseGuards(ApiKeyGuard)` 按类解析时 Nest 会自行构造，
    // 依赖必须能通过令牌解析（useValue 注册守卫类本身会因缺少 metatype 而回退成无参构造）。
    { provide: MODEL_SERVICE_KEY_REPOSITORY, useValue: repository },
    { provide: API_KEY_HASHER, useFactory: () => hasher },
    { provide: INVALID_KEY_THROTTLE, useValue: createInvalidKeyThrottle() },
    // 以下三个供测试按令牌取用，也便于未来把配额/熔断接到指标
    { provide: LLM_CALL_LOG_REPOSITORY, useValue: callLogs },
    { provide: LLM_USAGE_REPOSITORY, useValue: usageRepository },
    {
      provide: LLM_USAGE_SERVICE,
      useValue: new ModelServiceUsageService(usageRepository),
    },
    { provide: LLM_QUOTA_SERVICE, useValue: quota },
    { provide: UPSTREAM_CIRCUIT_BREAKER, useValue: breaker },
  ];
}

/** 测试缺省：用量读模型返回空值（真库集成测试覆盖实际查询）。 */
function emptyUsageRepository(): LlmUsageRepository {
  return {
    async aggregateDay(at) {
      return {
        usageDate: at.toISOString().slice(0, 10),
        sourceCalls: 0,
        rows: 0,
      };
    },
    async listDailyTotals() {
      return [];
    },
    async listByModel() {
      return [];
    },
    async listByKey() {
      return [];
    },
    async sumDaily() {
      return {
        calls: 0,
        errorCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    },
    async sumCallsLive() {
      return {
        calls: 0,
        errorCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    },
    async listCalls() {
      return { items: [], total: 0 };
    },
    async findUnaggregatedDays() {
      return [];
    },
  };
}

/** 测试缺省：不落台账（调用日志由真库集成测试覆盖）。 */
function emptyCallLogRepository(): LlmCallLogRepository {
  return {
    async insert() {
      return undefined;
    },
    async sumTokensSince() {
      return 0;
    },
  };
}

export type { ModelServiceAuditPort, ModelServiceKeyRepository };
