import type { ActorContext } from "@ai-hub/contracts";
import type { AuditEventInput } from "../system/security/audit.types.js";
import { createApiKeyHasher, type ApiKeyHasher } from "./api-key.hasher.js";
import {
  isUniqueViolation,
  type InsertApiKeyInput,
  type ModelServiceKeyRepository,
} from "./model-service-key.repository.js";
import {
  MODEL_SERVICE_ERROR_CODES,
  ModelServiceError,
  type ApiKeyEffectiveStatus,
  type ApiKeyPage,
  type ApiKeyRecord,
  type ApiKeySummary,
  type CreateApiKeyInput,
  type ListApiKeysQuery,
  type UpdateApiKeyInput,
} from "./llm-gateway.types.js";

/** 只依赖 recordEvent 的结构化端口，便于测试注入与解耦。 */
export interface ModelServiceAuditPort {
  recordEvent(input: AuditEventInput): Promise<void>;
}

export interface ModelServiceKeyServiceConfig {
  hmacSecret: string | undefined;
  hmacSecretPrevious: string | undefined;
  /** 平台限额上限：用户可设值不得高于它（默认值分配由网关在 M2/M3 执行时消费）。 */
  maxRpm: number;
  maxTpm: number;
  maxDailyTokens: number;
  maxKeysPerUser: number;
}

export interface CreateApiKeyResult {
  summary: ApiKeySummary;
  /** 一次性明文：仅在创建/轮换响应中返回，不落库、不入日志。 */
  apiKey: string;
}

const EXPIRES_IN_DAYS_MAX = 365;

/**
 * API Key 生命周期服务（PRD 7.5 状态机 / 8.1 控制面语义）。
 *
 * 三条贯穿全类的规则：
 * 1. **数据权限**：所有查询强制带 `employeeId`，越权一律表现为 `MODEL_KEY_NOT_FOUND`
 *    （不泄露存在性，与平台既有口径一致）；管理面（全平台）留待 M4 单独入口。
 * 2. **状态变更 CAS**：`disable/enable/rotate/revoke` 都带期望前置状态，未命中即 409；
 *    `disable/revoke` 幂等，`enable` 对 `revoked` 拒绝（终态不可回滚）。
 * 3. **明文只出现一次**：创建与轮换返回明文，其余任何路径都不返回明文或摘要。
 */
export class ModelServiceKeyService {
  private hasher: ApiKeyHasher | null = null;

  public constructor(
    private readonly repository: ModelServiceKeyRepository,
    private readonly audit: ModelServiceAuditPort,
    private readonly config: ModelServiceKeyServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async createKey(
    actor: ActorContext,
    input: CreateApiKeyInput,
  ): Promise<CreateApiKeyResult> {
    const hasher = this.requireHasher();
    this.assertLimits(input);

    const holding = await this.repository.countHoldingKeys(actor.employeeId);
    if (holding >= this.config.maxKeysPerUser) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.LIMIT_REACHED);
    }
    const existing = await this.repository.findHoldingByName(
      actor.employeeId,
      input.name,
    );
    if (existing !== null) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.NAME_DUPLICATED);
    }

    const generated = hasher.generate();
    const at = this.now();
    let record: ApiKeyRecord;
    try {
      record = await this.repository.insert({
        employeeId: actor.employeeId,
        name: input.name,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        rpmLimit: input.rpmLimit ?? null,
        tpmLimit: input.tpmLimit ?? null,
        dailyTokenLimit: input.dailyTokenLimit ?? null,
        expiresAt: this.resolveExpiresAt(input.expiresInDays, at),
        rotatedFromKeyId: null,
      });
    } catch (error) {
      // 并发同名由部分唯一索引兜住：翻译成同语义的领域错误而不是 500
      if (isUniqueViolation(error)) {
        throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.NAME_DUPLICATED);
      }
      throw error;
    }

    await this.auditEvent(actor, "api_key.create", record, {
      name: record.name,
      prefix: record.keyPrefix,
      expiresAt: record.expiresAt,
    });
    return { summary: this.toSummary(record, at), apiKey: generated.plaintext };
  }

  public async listKeys(
    actor: ActorContext,
    query: ListApiKeysQuery,
  ): Promise<ApiKeyPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { items, total } = await this.repository.listByEmployee({
      employeeId: actor.employeeId,
      includeRevoked: query.includeRevoked === true,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const at = this.now();
    return {
      items: items.map((record) => this.toSummary(record, at)),
      total,
      page,
      pageSize,
    };
  }

  public async getKey(
    actor: ActorContext,
    keyId: string,
  ): Promise<ApiKeySummary> {
    const record = await this.requireOwnKey(actor, keyId);
    return this.toSummary(record, this.now());
  }

  public async updateKey(
    actor: ActorContext,
    keyId: string,
    input: UpdateApiKeyInput,
  ): Promise<ApiKeySummary> {
    const record = await this.requireOwnKey(actor, keyId);
    if (record.status === "revoked") {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }
    this.assertLimits(input);

    if (input.name !== undefined && input.name !== record.name) {
      const duplicate = await this.repository.findHoldingByName(
        actor.employeeId,
        input.name,
      );
      if (duplicate !== null && duplicate.keyId !== keyId) {
        throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.NAME_DUPLICATED);
      }
    }

    const at = this.now();
    const updated = await this.repository.updateAttributes({
      keyId,
      employeeId: actor.employeeId,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.rpmLimit !== undefined ? { rpmLimit: input.rpmLimit } : {}),
      ...(input.tpmLimit !== undefined ? { tpmLimit: input.tpmLimit } : {}),
      ...(input.dailyTokenLimit !== undefined
        ? { dailyTokenLimit: input.dailyTokenLimit }
        : {}),
      ...(input.expiresInDays !== undefined
        ? { expiresAt: this.resolveExpiresAt(input.expiresInDays, at) }
        : {}),
      now: at,
    });
    // 仓储带 `status <> 'revoked'` 条件：这里为 null 只会是并发撤销
    if (updated === null) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }

    await this.auditEvent(actor, "api_key.update", updated, {
      fields: Object.keys(input),
    });
    return this.toSummary(updated, at);
  }

  /** 禁用：幂等——已是 disabled 直接返回当前状态；revoked 终态拒绝。 */
  public async disableKey(
    actor: ActorContext,
    keyId: string,
  ): Promise<ApiKeySummary> {
    const record = await this.requireOwnKey(actor, keyId);
    if (record.status === "revoked") {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }
    if (record.status === "disabled") {
      return this.toSummary(record, this.now());
    }
    const at = this.now();
    const disabled = await this.repository.updateStatusCas({
      keyId,
      employeeId: actor.employeeId,
      expectedStatus: "active",
      nextStatus: "disabled",
      now: at,
    });
    if (disabled === null) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }
    await this.auditEvent(actor, "api_key.disable", disabled, {});
    return this.toSummary(disabled, at);
  }

  /**
   * 启用：幂等——已是 active 直接返回。已过期的 Key 允许启用到 active 存储状态，
   * 但 `effectiveStatus` 仍为 `expired`（过期判定在读取侧按服务端时钟计算）。
   */
  public async enableKey(
    actor: ActorContext,
    keyId: string,
  ): Promise<ApiKeySummary> {
    const record = await this.requireOwnKey(actor, keyId);
    if (record.status === "revoked") {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }
    if (record.status === "active") {
      return this.toSummary(record, this.now());
    }
    const at = this.now();
    const enabled = await this.repository.updateStatusCas({
      keyId,
      employeeId: actor.employeeId,
      expectedStatus: "disabled",
      nextStatus: "active",
      now: at,
    });
    if (enabled === null) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }
    await this.auditEvent(actor, "api_key.enable", enabled, {});
    return this.toSummary(enabled, at);
  }

  /**
   * 轮换：同一事务内「建新钥 + 撤销旧钥」，无宽限期（PRD 7.5）。
   * 需要并行过渡时应先创建新 Key，切换完成后再禁用旧 Key。
   */
  public async rotateKey(
    actor: ActorContext,
    keyId: string,
  ): Promise<CreateApiKeyResult> {
    const hasher = this.requireHasher();
    const record = await this.requireOwnKey(actor, keyId);
    if (record.status === "revoked") {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }

    const generated = hasher.generate();
    const at = this.now();
    const replacement: InsertApiKeyInput = {
      employeeId: actor.employeeId,
      // 沿用原名与限额：轮换是换凭据，不是改配置；同名可行是因为旧钥同事务内已成 revoked，
      // 而唯一索引只约束 `status <> 'revoked'`。
      name: record.name,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      rpmLimit: record.limits.rpm,
      tpmLimit: record.limits.tpm,
      dailyTokenLimit: record.limits.dailyTokens,
      expiresAt: record.expiresAt,
      rotatedFromKeyId: record.keyId,
    };

    const rotated = await this.repository.rotate({
      keyId,
      employeeId: actor.employeeId,
      expectedStatus: record.status,
      replacement,
      now: at,
    });
    if (rotated === null) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }

    await this.auditEvent(actor, "api_key.rotate", rotated.created, {
      rotatedFromKeyId: record.keyId,
    });
    return {
      summary: this.toSummary(rotated.created, at),
      apiKey: generated.plaintext,
    };
  }

  /** 删除即撤销（软删）：不物理删除，调用记录与审计保留可查。 */
  public async revokeKey(actor: ActorContext, keyId: string): Promise<void> {
    const record = await this.requireOwnKey(actor, keyId);
    if (record.status === "revoked") {
      return; // 幂等
    }
    const at = this.now();
    const revoked = await this.repository.updateStatusCas({
      keyId,
      employeeId: actor.employeeId,
      expectedStatus: record.status,
      nextStatus: "revoked",
      now: at,
    });
    if (revoked === null) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.STATE_CONFLICT);
    }
    await this.auditEvent(actor, "api_key.revoke", revoked, {});
  }

  // ---- 内部 ----

  private requireHasher(): ApiKeyHasher {
    if (this.config.hmacSecret === undefined) {
      // 未配置摘要密钥：明确拒绝而不是生成一个无法校验的 Key
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.NOT_CONFIGURED);
    }
    this.hasher ??= createApiKeyHasher({
      secret: this.config.hmacSecret,
      previousSecret: this.config.hmacSecretPrevious,
    });
    return this.hasher;
  }

  private async requireOwnKey(
    actor: ActorContext,
    keyId: string,
  ): Promise<ApiKeyRecord> {
    const record = await this.repository.findById(keyId, actor.employeeId);
    if (record === null) {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.NOT_FOUND);
    }
    return record;
  }

  /** 限额校验：越界或高于平台上限一律 MODEL_KEY_INVALID_LIMIT（PRD 8.1）。 */
  private assertLimits(input: {
    rpmLimit?: number | null;
    tpmLimit?: number | null;
    dailyTokenLimit?: number | null;
    expiresInDays?: number | null;
  }): void {
    const invalid = (): never => {
      throw new ModelServiceError(MODEL_SERVICE_ERROR_CODES.INVALID_LIMIT);
    };
    if (!this.withinRange(input.rpmLimit, this.config.maxRpm)) invalid();
    if (!this.withinRange(input.tpmLimit, this.config.maxTpm)) invalid();
    if (!this.withinRange(input.dailyTokenLimit, this.config.maxDailyTokens)) {
      invalid();
    }
    if (
      input.expiresInDays !== undefined &&
      input.expiresInDays !== null &&
      (input.expiresInDays < 1 || input.expiresInDays > EXPIRES_IN_DAYS_MAX)
    ) {
      invalid();
    }
  }

  private withinRange(value: number | null | undefined, max: number): boolean {
    if (value === undefined || value === null) return true;
    return Number.isInteger(value) && value >= 1 && value <= max;
  }

  private resolveExpiresAt(
    expiresInDays: number | null | undefined,
    at: Date,
  ): Date | null {
    if (expiresInDays === undefined || expiresInDays === null) return null;
    return new Date(at.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  }

  /** 派生状态：revoked/disabled 优先；active 再按服务端时钟判过期。 */
  private effectiveStatus(
    record: ApiKeyRecord,
    at: Date,
  ): ApiKeyEffectiveStatus {
    if (record.status !== "active") return record.status;
    if (
      record.expiresAt !== null &&
      record.expiresAt.getTime() <= at.getTime()
    ) {
      return "expired";
    }
    return "active";
  }

  private toSummary(record: ApiKeyRecord, at: Date): ApiKeySummary {
    return {
      keyId: record.keyId,
      name: record.name,
      prefix: record.keyPrefix,
      status: record.status,
      effectiveStatus: this.effectiveStatus(record, at),
      limits: record.limits,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      disabledAt: record.disabledAt?.toISOString() ?? null,
    };
  }

  /** 审计：Key 生命周期属于凭据类操作，统一 risk=medium；审计失败不影响业务结果。 */
  private async auditEvent(
    actor: ActorContext,
    action: string,
    record: ApiKeyRecord,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.recordEvent({
      module: "model_service",
      action,
      actorEmployeeId: actor.employeeId,
      subject: record.keyId,
      result: "success",
      risk: "medium",
      details: {
        name: record.name,
        prefix: record.keyPrefix,
        status: record.status,
        ...details,
      },
    });
  }
}
