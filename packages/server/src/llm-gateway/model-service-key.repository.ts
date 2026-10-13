import type { DatabaseSchema, LlmApiKeyStatus } from "@ai-hub/database";
import type { Kysely } from "kysely";
import type { ApiKeyRecord } from "./llm-gateway.types.js";

/**
 * API Key 仓储（PRD 9.1）。
 *
 * 两条硬约束由数据库承担、而不是靠应用层「先查再写」：
 * - `key_hash` 唯一索引：鉴权按摘要点查；
 * - `(employee_id, name) where status <> 'revoked'` 部分唯一索引：同名防重，
 *   且在并发创建时是真防线（check-then-insert 必有 TOCTOU 窗口）。
 * 状态变更一律 CAS（`where status = 期望前置状态`），未命中即代表并发冲突。
 */

export interface InsertApiKeyInput {
  employeeId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  rpmLimit: number | null;
  tpmLimit: number | null;
  dailyTokenLimit: number | null;
  expiresAt: Date | null;
  rotatedFromKeyId: string | null;
}

export interface UpdateApiKeyAttributesInput {
  keyId: string;
  employeeId: string;
  /** 未提供的字段（undefined）保持原值；显式 null 表示回到平台默认。 */
  name?: string;
  rpmLimit?: number | null;
  tpmLimit?: number | null;
  dailyTokenLimit?: number | null;
  expiresAt?: Date | null;
  now: Date;
}

export interface UpdateApiKeyStatusInput {
  keyId: string;
  employeeId: string;
  expectedStatus: LlmApiKeyStatus;
  nextStatus: "active" | "disabled" | "revoked";
  now: Date;
}

export interface RotateApiKeyInput {
  keyId: string;
  employeeId: string;
  expectedStatus: LlmApiKeyStatus;
  replacement: InsertApiKeyInput;
  now: Date;
}

export interface ListApiKeysInput {
  employeeId: string;
  includeRevoked: boolean;
  limit: number;
  offset: number;
}

export interface ModelServiceKeyRepository {
  insert(input: InsertApiKeyInput): Promise<ApiKeyRecord>;
  findById(keyId: string, employeeId: string): Promise<ApiKeyRecord | null>;
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  /**
   * 网关鉴权用：按**候选摘要**查找（双密钥过渡期会给出新/旧两个摘要）。
   * 命中 `key_hash` 唯一索引，参数化后仍是索引点查。
   */
  findByHashes(hashes: readonly string[]): Promise<ApiKeyRecord | null>;
  /** 员工在职状态（网关鉴权：停用员工名下 Key 一律不可用）。 */
  findEmployeeStatus(employeeId: string): Promise<string | null>;
  /** 记录最近一次**成功**调用时刻（best-effort，失败不影响转发结果）。 */
  touchLastUsedAt(keyId: string, at: Date): Promise<void>;
  findHoldingByName(
    employeeId: string,
    name: string,
  ): Promise<ApiKeyRecord | null>;
  /** 计数「占位」Key：active + disabled（revoked 不占额度），用于每人上限校验。 */
  countHoldingKeys(employeeId: string): Promise<number>;
  listByEmployee(
    input: ListApiKeysInput,
  ): Promise<{ items: ApiKeyRecord[]; total: number }>;
  updateAttributes(
    input: UpdateApiKeyAttributesInput,
  ): Promise<ApiKeyRecord | null>;
  updateStatusCas(input: UpdateApiKeyStatusInput): Promise<ApiKeyRecord | null>;
  rotate(
    input: RotateApiKeyInput,
  ): Promise<{ previous: ApiKeyRecord; created: ApiKeyRecord } | null>;
}

/** bigint 列（daily_token_limit）由 pg 驱动以字符串返回，这里统一归一为 number。 */
function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" ? value : Number(value);
}

interface KeyRow {
  key_id: string;
  employee_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  status: LlmApiKeyStatus;
  rpm_limit: number | null;
  tpm_limit: number | null;
  daily_token_limit: string | number | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  rotated_from_key_id: string | null;
  created_at: Date;
  updated_at: Date;
  disabled_at: Date | null;
}

function toRecord(row: KeyRow): ApiKeyRecord {
  return {
    keyId: row.key_id,
    employeeId: row.employee_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    status: row.status,
    limits: {
      rpm: row.rpm_limit,
      tpm: row.tpm_limit,
      dailyTokens: toNumber(row.daily_token_limit),
    },
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    rotatedFromKeyId: row.rotated_from_key_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
  };
}

/** 唯一索引冲突（同摘要 / 同名）由 pg 报 23505，服务层据此区分是否重试或报重复。 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export class KyselyModelServiceKeyRepository
  implements ModelServiceKeyRepository
{
  public constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly transaction?: Kysely<DatabaseSchema>,
  ) {}

  /** 在事务中执行：用于「轮换 = 建新钥 + 撤销旧钥」这类必须原子完成的组合写。 */
  private get executor(): Kysely<DatabaseSchema> {
    return this.transaction ?? this.db;
  }

  public async insert(input: InsertApiKeyInput): Promise<ApiKeyRecord> {
    const row = await this.executor
      .insertInto("llm_api_keys")
      .values({
        employee_id: input.employeeId,
        name: input.name,
        key_prefix: input.keyPrefix,
        key_hash: input.keyHash,
        status: "active",
        rpm_limit: input.rpmLimit,
        tpm_limit: input.tpmLimit,
        daily_token_limit:
          input.dailyTokenLimit === null ? null : String(input.dailyTokenLimit),
        expires_at: input.expiresAt,
        rotated_from_key_id: input.rotatedFromKeyId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRecord(row as KeyRow);
  }

  public async findById(
    keyId: string,
    employeeId: string,
  ): Promise<ApiKeyRecord | null> {
    const row = await this.executor
      .selectFrom("llm_api_keys")
      .selectAll()
      .where("key_id", "=", keyId)
      // 数据权限：本人维度强制过滤，管理面另有入口；越权查询天然查不到（对外按 404 处理）
      .where("employee_id", "=", employeeId)
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row as KeyRow);
  }

  public async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const row = await this.executor
      .selectFrom("llm_api_keys")
      .selectAll()
      .where("key_hash", "=", keyHash)
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row as KeyRow);
  }

  public async findByHashes(
    hashes: readonly string[],
  ): Promise<ApiKeyRecord | null> {
    if (hashes.length === 0) return null;
    const row = await this.executor
      .selectFrom("llm_api_keys")
      .selectAll()
      .where("key_hash", "in", [...hashes])
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row as KeyRow);
  }

  public async findEmployeeStatus(employeeId: string): Promise<string | null> {
    const row = await this.executor
      .selectFrom("employees")
      .select("status")
      .where("employee_id", "=", employeeId)
      .executeTakeFirst();
    return row?.status ?? null;
  }

  public async touchLastUsedAt(keyId: string, at: Date): Promise<void> {
    await this.executor
      .updateTable("llm_api_keys")
      .set({ last_used_at: at })
      .where("key_id", "=", keyId)
      .execute();
  }

  public async findHoldingByName(
    employeeId: string,
    name: string,
  ): Promise<ApiKeyRecord | null> {
    const row = await this.executor
      .selectFrom("llm_api_keys")
      .selectAll()
      .where("employee_id", "=", employeeId)
      .where("name", "=", name)
      .where("status", "<>", "revoked")
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row as KeyRow);
  }

  public async countHoldingKeys(employeeId: string): Promise<number> {
    const row = await this.executor
      .selectFrom("llm_api_keys")
      .select(({ fn }) => fn.countAll<string>().as("count"))
      .where("employee_id", "=", employeeId)
      .where("status", "in", ["active", "disabled"])
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  public async listByEmployee(
    input: ListApiKeysInput,
  ): Promise<{ items: ApiKeyRecord[]; total: number }> {
    const base = this.executor
      .selectFrom("llm_api_keys")
      .where("employee_id", "=", input.employeeId);
    const filtered = input.includeRevoked
      ? base
      : base.where("status", "<>", "revoked");

    const [rows, countRow] = await Promise.all([
      filtered
        .selectAll()
        .orderBy("created_at", "desc")
        .limit(input.limit)
        .offset(input.offset)
        .execute(),
      filtered
        .select(({ fn }) => fn.countAll<string>().as("count"))
        .executeTakeFirst(),
    ]);
    return {
      items: rows.map((row) => toRecord(row as KeyRow)),
      total: Number(countRow?.count ?? 0),
    };
  }

  public async updateAttributes(
    input: UpdateApiKeyAttributesInput,
  ): Promise<ApiKeyRecord | null> {
    const patch: Record<string, unknown> = { updated_at: input.now };
    if (input.name !== undefined) patch["name"] = input.name;
    if (input.rpmLimit !== undefined) patch["rpm_limit"] = input.rpmLimit;
    if (input.tpmLimit !== undefined) patch["tpm_limit"] = input.tpmLimit;
    if (input.dailyTokenLimit !== undefined) {
      patch["daily_token_limit"] =
        input.dailyTokenLimit === null ? null : String(input.dailyTokenLimit);
    }
    if (input.expiresAt !== undefined) patch["expires_at"] = input.expiresAt;

    const row = await this.executor
      .updateTable("llm_api_keys")
      .set(patch as never)
      .where("key_id", "=", input.keyId)
      .where("employee_id", "=", input.employeeId)
      // revoked 是不可逆终态：属性变更必须挡住它
      .where("status", "<>", "revoked")
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row as KeyRow);
  }

  public async updateStatusCas(
    input: UpdateApiKeyStatusInput,
  ): Promise<ApiKeyRecord | null> {
    const patch: Record<string, unknown> = {
      status: input.nextStatus,
      updated_at: input.now,
    };
    // disabled_at 语义（PRD 9.1）：仅记录最近一次禁用时刻，启用时清空；撤销不改动它
    if (input.nextStatus === "disabled") patch["disabled_at"] = input.now;
    if (input.nextStatus === "active") patch["disabled_at"] = null;

    const row = await this.executor
      .updateTable("llm_api_keys")
      .set(patch as never)
      .where("key_id", "=", input.keyId)
      .where("employee_id", "=", input.employeeId)
      .where("status", "=", input.expectedStatus)
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row as KeyRow);
  }

  public async rotate(
    input: RotateApiKeyInput,
  ): Promise<{ previous: ApiKeyRecord; created: ApiKeyRecord } | null> {
    return this.db
      .transaction()
      .execute(async (transaction) => {
        const scoped = new KyselyModelServiceKeyRepository(
          this.db,
          transaction,
        );
        const previous = await scoped.updateStatusCas({
          keyId: input.keyId,
          employeeId: input.employeeId,
          expectedStatus: input.expectedStatus,
          nextStatus: "revoked",
          now: input.now,
        });
        if (previous === null) {
          // CAS 未命中：状态已被并发操作改变（例如对方先撤销），整体回滚
          throw new RotationCasMissedError();
        }
        const created = await scoped.insert(input.replacement);
        return { previous, created };
      })
      .catch((error: unknown) => {
        if (error instanceof RotationCasMissedError) return null;
        throw error;
      });
  }
}

/** 内部信号：轮换时旧钥 CAS 未命中，用于把事务结果翻译成 `null`。 */
class RotationCasMissedError extends Error {
  public constructor() {
    super("MODEL_KEY_STATE_CONFLICT");
    this.name = "RotationCasMissedError";
  }
}
