import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    insert into roles (role_code, name, permissions, is_system)
    values
      ('analytics_operator', '分析运营员', '["analytics.read"]'::jsonb, true),
      ('analytics_exporter', '分析导出员', '["analytics.read"]'::jsonb, true),
      ('analytics_identity_export', '分析身份导出员', '["analytics.read"]'::jsonb, true),
      ('analytics_assistant_user', '分析助手用户', '["analytics.read"]'::jsonb, true),
      ('analytics_platform_reader', '平台分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_market_reader', '市场分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_application_reader', '应用分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_innovation_reader', '创新分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_review_reader', '审核分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_department_reader', '部门分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_risk_reader', '风险分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_runtime_reader', '运行分析查看员', '["analytics.read"]'::jsonb, true),
      ('analytics_integration_reader', '集成分析查看员', '["analytics.read"]'::jsonb, true)
    on conflict (role_code) do update
      set permissions = excluded.permissions,
          name = excluded.name,
          is_system = true
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    delete from roles
    where role_code like 'analytics_%'
      and is_system = true
  `.execute(db);
}
