import { sql, type Kysely } from "kysely";

/**
 * 为 artifact_uploads 增加 signed 列（规格 §5.5）：
 *
 * - 旧行为：无签名且配置了签名器时，worker 自动签名后完成校验，
 *   已完成的制品必然签名非空。
 * - 新行为：worker 不再自动签名，未签名制品以 signed=false 完成校验，
 *   创建版本/提交审核时必须由提交人显式确认风险。
 * - NOT NULL DEFAULT TRUE：存量已完成上传（全部已签名）与既有代码
 *   （createArtifactUpload 不写该列）保持默认已签名语义。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_artifact_uploads
    add column signed boolean not null default true
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_artifact_uploads
    drop column if exists signed
  `.execute(db);
}
