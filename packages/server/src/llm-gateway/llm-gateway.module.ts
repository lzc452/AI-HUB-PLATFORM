import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { AuditService } from "../system/security/audit.service.js";
import { KyselyAuditRepository } from "../system/security/audit.repository.js";
import { LLM_GATEWAY_SERVICE } from "./llm-gateway.tokens.js";
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

/**
 * 模型服务模块（M1：控制面 Key 生命周期）。
 *
 * 与平台其他模块一致采用「手工装配 + 令牌导出」：配置由调用方（apps/api）从 RuntimeConfig
 * 传入，模块内不读 `process.env`——这样单测可以直接构造服务，不需要伪造环境变量。
 *
 * 网关面（`/v1` 转发、限流配额、调用记账）属于 M2/M3，本模块暂不包含。
 */
@Module({})
export class LlmGatewayModule {
  public static register(
    database: Kysely<DatabaseSchema>,
    options: ModelServiceKeyServiceConfig,
  ): DynamicModule {
    return {
      module: LlmGatewayModule,
      imports: [IdentityModule.register(database)],
      controllers: [ModelServiceKeyController],
      providers: [
        {
          provide: LLM_GATEWAY_SERVICE,
          useValue: new ModelServiceKeyService(
            new KyselyModelServiceKeyRepository(database),
            new AuditService(new KyselyAuditRepository(database)),
            options,
          ),
        },
      ],
      exports: [LLM_GATEWAY_SERVICE],
    };
  }

  /** 测试装配：直接注入服务与身份服务，避免测试环境依赖真实数据库。 */
  public static forTest(
    service: ModelServiceKeyService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: LlmGatewayModule,
      controllers: [ModelServiceKeyController],
      providers: [
        { provide: LLM_GATEWAY_SERVICE, useValue: service },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [LLM_GATEWAY_SERVICE],
    };
  }
}

export type {
  ModelServiceAuditPort,
  ModelServiceKeyRepository,
  ModelServiceKeyServiceConfig,
};
