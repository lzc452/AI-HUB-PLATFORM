import { sql, type Kysely } from "kysely";

/** 提交深链：版本制品字段可空（Web/小程序等无安装包类型）。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_versions
      alter column artifact_key drop not null,
      alter column artifact_sha256 drop not null,
      alter column artifact_signature drop not null
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    update application_versions
      set artifact_key = coalesce(artifact_key, ''),
          artifact_sha256 = coalesce(artifact_sha256, ''),
          artifact_signature = coalesce(artifact_signature, '')
  `.execute(db);

  await sql`
    alter table application_versions
      alter column artifact_key set not null,
      alter column artifact_sha256 set not null,
      alter column artifact_signature set not null
  `.execute(db);
}
