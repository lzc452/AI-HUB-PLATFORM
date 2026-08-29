import type { ActorContext } from "@ai-hub/contracts";
import type { DatabaseSchema, PortalResourceStatus } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import type {
  DashboardCommentQuery,
  PortalCommentItem,
  PortalListInput,
  PortalListResult,
  PortalNativeDraftInput,
  PortalNativeResourceType,
  PortalRepository,
  PortalResourceItem,
  PortalResourceType,
  PortalVersionInput,
} from "./portal.types.js";

interface ResourceRow {
  resource_id: string;
  owner_employee_id: string;
  owner_name: string;
  slug: string;
  name: string;
  summary: string;
  status: PortalResourceStatus;
  current_version_id?: string | null;
  metadata: unknown;
  favorite_count: string | number;
  is_favorited: boolean;
  created_at: Date;
  updated_at: Date;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function languageForMime(mimeType: string): string | undefined {
  if (mimeType.includes("markdown")) return "markdown";
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("javascript")) return "javascript";
  if (mimeType.includes("typescript")) return "typescript";
  if (mimeType.includes("text")) return "text";
  return undefined;
}

function deliveryTypeLabel(channel: string): string {
  switch (channel) {
    case "mini_program":
      return "Mini Program";
    case "desktop":
      return "Desktop";
    case "mobile":
      return "Mobile";
    default:
      return "Web";
  }
}

function defaultContentSummary(pageKey: string): string {
  switch (pageKey) {
    case "tutorials":
      return "从发现资源到发布审核，快速掌握 AI Hub Portal。";
    case "about":
      return "让经过验证的 AI 能力在企业内被安全地发现与复用。";
    case "updates":
      return "了解 Portal 最新功能、体验优化和安全能力。";
    default:
      return "AI Hub Portal 内容摘要。";
  }
}

function compatibilityLabels(
  deliveries: readonly { channel: string; targets: unknown }[],
): string[] {
  const labels = new Set<string>();
  for (const delivery of deliveries) {
    const targets = Array.isArray(delivery.targets) ? delivery.targets : [];
    for (const target of targets) {
      if (!isObjectRecord(target)) continue;
      if (target.os === "windows") labels.add("Windows");
      if (target.os === "macos") labels.add("macOS");
      if (target.platform === "android") labels.add("Android");
      if (target.platform === "ios") labels.add("iOS");
      if (target.platform === "wechat") labels.add("WeChat");
      if (target.platform === "dingtalk") labels.add("DingTalk");
      if (target.platform === "alipay") labels.add("Alipay");
      if (target.kind === "desktop") labels.add("Desktop");
      if (target.kind === "mobile") labels.add("Mobile");
      if (target.kind === "miniprogram") labels.add("Mini Program");
    }
    if (targets.length === 0) {
      if (delivery.channel === "web") labels.add("Web");
      if (delivery.channel === "desktop") labels.add("Desktop");
      if (delivery.channel === "mobile") labels.add("Mobile");
      if (delivery.channel === "mini_program") labels.add("Mini Program");
    }
  }
  return [...labels];
}

interface CommentRow {
  comment_id: string;
  resource_type: PortalResourceType;
  resource_id: string;
  resource_name: string;
  resource_slug: string;
  owner_employee_id: string;
  body: string;
  parent_comment_id: string | null;
  parent_body: string | null;
  author_employee_id: string;
  author_name: string;
  parent_author_employee_id: string | null;
  parent_author_name: string | null;
  created_at: Date;
}

const nativeConfig = {
  skill: {
    table: "portal_skills",
    id: "skill_id",
    slug: "skill_slug",
    versions: "portal_skill_versions",
    versionId: "skill_version_id",
  },
  plugin: {
    table: "portal_plugins",
    id: "plugin_id",
    slug: "plugin_slug",
    versions: "portal_plugin_versions",
    versionId: "plugin_version_id",
  },
  mcp: {
    table: "portal_mcps",
    id: "mcp_id",
    slug: "mcp_slug",
    versions: "portal_mcp_versions",
    versionId: "mcp_version_id",
  },
} as const;

const toNumber = (value: string | number): number => Number(value);

export function redactPortalMetadata(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item) => redactPortalMetadata(item));
  if (value === null || typeof value !== "object") return value;
  const hidden =
    /(?:storage|object)[_-]?key|secret|password|access[_-]?token|refresh[_-]?token/i;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !hidden.test(key))
      .map(([key, nested]) => [key, redactPortalMetadata(nested)]),
  );
}

export function assertPortalReplyParent(
  parent:
    | {
        resourceType: PortalResourceType;
        resourceId: string;
        parentCommentId: string | null;
      }
    | undefined,
  expectedType: PortalResourceType,
  expectedResourceId: string,
): void {
  if (
    parent === undefined ||
    parent.resourceType !== expectedType ||
    parent.resourceId !== expectedResourceId
  ) {
    throw new Error("PORTAL_PARENT_COMMENT_NOT_FOUND");
  }
  if (parent.parentCommentId !== null)
    throw new Error("PORTAL_REPLY_DEPTH_EXCEEDED");
}

export class KyselyPortalRepository implements PortalRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listResources(
    actor: ActorContext | null,
    type: PortalResourceType,
    input: PortalListInput,
  ): Promise<PortalListResult> {
    const offset = (input.page - 1) * input.pageSize;
    const queryFilter = input.query?.trim() ?? "";
    const ownerFilter = input.ownerEmployeeId ?? "";
    const statusFilter = input.status ?? "published";
    const order =
      input.sortBy === "name"
        ? sql`name asc`
        : input.sortBy === "score"
          ? sql`favorite_count desc, updated_at desc`
          : sql`updated_at desc`;
    const viewerEmployeeId = actor?.employeeId ?? null;
    const rows =
      type === "app"
        ? await sql<ResourceRow>`
            select a.application_id as resource_id, a.owner_employee_id,
              e.display_name as owner_name, a.application_id::text as slug,
              a.name, a.summary, a.status, a.current_version_id, '{}'::jsonb as metadata,
              (select count(*) from portal_favorites f where f.resource_type = 'app' and f.resource_id = a.application_id) as favorite_count,
              exists(select 1 from portal_favorites f where f.employee_id = ${viewerEmployeeId} and f.resource_type = 'app' and f.resource_id = a.application_id) as is_favorited,
              a.created_at, a.updated_at
            from applications a join employees e on e.employee_id = a.owner_employee_id
            where a.status = ${statusFilter}
              and (${queryFilter} = '' or a.name ilike ${`%${queryFilter}%`} or a.summary ilike ${`%${queryFilter}%`})
              and (${ownerFilter} = '' or a.owner_employee_id = ${ownerFilter})
            order by ${order} limit ${input.pageSize} offset ${offset}
          `.execute(this.database)
        : await this.listNativeRows(
            actor,
            type,
            queryFilter,
            ownerFilter,
            statusFilter,
            order,
            input.pageSize,
            offset,
          );
    const totalResult =
      type === "app"
        ? await sql<{ total: string | number }>`
            select count(*) as total from applications a
            where a.status = ${statusFilter}
              and (${queryFilter} = '' or a.name ilike ${`%${queryFilter}%`} or a.summary ilike ${`%${queryFilter}%`})
              and (${ownerFilter} = '' or a.owner_employee_id = ${ownerFilter})
          `.execute(this.database)
        : await this.countNative(type, queryFilter, ownerFilter, statusFilter);
    return {
      items:
        type === "app"
          ? await Promise.all(
              rows.rows.map((row) => this.mapApplicationResource(row, false)),
            )
          : rows.rows.map((row) => this.mapResource(type, row)),
      total: toNumber(totalResult.rows[0]?.total ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async findResource(
    actor: ActorContext | null,
    type: PortalResourceType,
    ownerEmployeeId: string | null,
    slug: string,
  ): Promise<PortalResourceItem | null> {
    const viewerEmployeeId = actor?.employeeId ?? null;
    const canReview =
      actor?.permissions?.includes("*") === true ||
      actor?.permissions?.includes("application.review") === true;
    const canManage =
      actor?.permissions?.includes("*") === true ||
      actor?.permissions?.includes("application.manage") === true;
    const result =
      type === "app"
        ? await sql<ResourceRow>`
            select a.application_id as resource_id, a.owner_employee_id,
              e.display_name as owner_name, a.application_id::text as slug,
              a.name, a.summary, a.status, a.current_version_id, '{}'::jsonb as metadata,
              (select count(*) from portal_favorites f where f.resource_type = 'app' and f.resource_id = a.application_id) as favorite_count,
              exists(select 1 from portal_favorites f where f.employee_id = ${viewerEmployeeId} and f.resource_type = 'app' and f.resource_id = a.application_id) as is_favorited,
              a.created_at, a.updated_at
            from applications a join employees e on e.employee_id = a.owner_employee_id
            where a.application_id::text = ${slug}
              and (${ownerEmployeeId}::text is null or a.owner_employee_id = ${ownerEmployeeId})
              and (
                a.status = 'published' or a.owner_employee_id = ${viewerEmployeeId}
                or a.maintainer_employee_id = ${viewerEmployeeId}
                or exists(select 1 from application_maintainers m where m.application_id = a.application_id and m.employee_id = ${viewerEmployeeId})
                or ${canReview}
                or ${canManage}
              )
            limit 1
          `.execute(this.database)
        : await this.findNative(actor, type, ownerEmployeeId, slug, canReview);
    const row = result.rows[0];
    return row === undefined
      ? null
      : type === "app"
        ? this.mapApplicationResource(row, true)
        : this.mapResource(type, row);
  }

  async createDraft(
    actor: ActorContext,
    input: PortalNativeDraftInput,
  ): Promise<PortalResourceItem> {
    await this.database.transaction().execute(async (trx) => {
      const config = nativeConfig[input.resourceType];
      const result = await sql<{ resource_id: string }>`
        insert into ${sql.table(config.table)}
          (owner_employee_id, ${sql.ref(config.slug)}, name, summary, metadata, status)
        values (${actor.employeeId}, ${input.slug}, ${input.name}, ${input.summary}, ${JSON.stringify(input.metadata ?? {})}::jsonb, 'draft')
        returning ${sql.ref(config.id)} as resource_id
      `.execute(trx);
      const id = result.rows[0]?.resource_id;
      if (id === undefined) throw new Error("PORTAL_DRAFT_CREATE_FAILED");
      await this.recordOutbox(
        trx,
        input.resourceType,
        id,
        "draft.created",
        actor.employeeId,
      );
      return id;
    });
    const resource = await this.findResource(
      actor,
      input.resourceType,
      input.resourceType === "mcp" ? null : actor.employeeId,
      input.slug,
    );
    if (resource === null) throw new Error("PORTAL_DRAFT_CREATE_FAILED");
    return resource;
  }

  async updateDraft(
    actor: ActorContext,
    type: PortalNativeResourceType,
    resourceId: string,
    input: Omit<PortalNativeDraftInput, "resourceType">,
  ): Promise<PortalResourceItem> {
    await this.database.transaction().execute(async (trx) => {
      const config = nativeConfig[type];
      const updated = await sql<{ resource_id: string }>`
        update ${sql.table(config.table)} set
          ${sql.ref(config.slug)} = ${input.slug}, name = ${input.name},
          summary = ${input.summary}, metadata = ${JSON.stringify(input.metadata ?? {})}::jsonb,
          updated_at = now()
        where ${sql.ref(config.id)} = ${resourceId} and owner_employee_id = ${actor.employeeId}
          and status in ('draft', 'withdrawn')
        returning ${sql.ref(config.id)} as resource_id
      `.execute(trx);
      if (updated.rows.length !== 1)
        throw new Error("PORTAL_RESOURCE_NOT_EDITABLE");
      await this.recordOutbox(
        trx,
        type,
        resourceId,
        "draft.updated",
        actor.employeeId,
      );
    });
    const resource = await this.findResourceById(actor, type, resourceId);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return resource;
  }

  async saveVersion(
    actor: ActorContext,
    type: PortalNativeResourceType,
    resourceId: string,
    input: PortalVersionInput,
  ): Promise<void> {
    await this.database.transaction().execute(async (trx) => {
      const config = nativeConfig[type];
      const inserted = await sql<{ version_id: string }>`
        insert into ${sql.table(config.versions)}
          (${sql.ref(config.id)}, version, changelog, metadata, scan_status, created_by_employee_id)
        values (${resourceId}, ${input.version}, ${input.changelog}, ${JSON.stringify(input.metadata ?? {})}::jsonb, 'pending', ${actor.employeeId})
        returning ${sql.ref(config.versionId)} as version_id
      `.execute(trx);
      const versionId = inserted.rows[0]?.version_id;
      if (versionId === undefined)
        throw new Error("PORTAL_VERSION_CREATE_FAILED");
      await sql`
        update ${sql.table(config.table)} set current_version_id = ${versionId}, updated_at = now()
        where ${sql.ref(config.id)} = ${resourceId} and owner_employee_id = ${actor.employeeId}
      `.execute(trx);
      await this.recordOutbox(
        trx,
        type,
        resourceId,
        "version.created",
        actor.employeeId,
      );
    });
  }

  async transition(
    actor: ActorContext,
    type: PortalNativeResourceType,
    resourceId: string,
    from: readonly PortalResourceStatus[],
    to: PortalResourceStatus,
  ): Promise<PortalResourceItem> {
    await this.database.transaction().execute(async (trx) => {
      const table = nativeConfig[type].table;
      const id = nativeConfig[type].id;
      const allowed = sql.join(from.map((status) => sql`${status}`));
      const result = await sql<{ resource_id: string }>`
        update ${sql.table(table)} set status = ${to}, updated_at = now()
        where ${sql.ref(id)} = ${resourceId} and status in (${allowed})
        returning ${sql.ref(id)} as resource_id
      `.execute(trx);
      if (result.rows.length === 0)
        throw new Error("PORTAL_RESOURCE_STATE_CONFLICT");
      await this.recordOutbox(
        trx,
        type,
        resourceId,
        `status.${to}`,
        actor.employeeId,
      );
    });
    const resource = await this.findResourceById(actor, type, resourceId);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return resource;
  }

  async setFavorite(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    active: boolean,
  ): Promise<boolean> {
    if (active) {
      await this.database
        .insertInto("portal_favorites")
        .values({
          employee_id: actor.employeeId,
          resource_type: type,
          resource_id: resourceId,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["employee_id", "resource_type", "resource_id"])
            .doNothing(),
        )
        .execute();
    } else {
      await this.database
        .deleteFrom("portal_favorites")
        .where("employee_id", "=", actor.employeeId)
        .where("resource_type", "=", type)
        .where("resource_id", "=", resourceId)
        .execute();
    }
    return active;
  }

  async listFavorites(
    actor: ActorContext,
    page: number,
    pageSize: number,
  ): Promise<PortalListResult> {
    const favoriteRows = await this.database
      .selectFrom("portal_favorites")
      .select(["resource_type", "resource_id"])
      .where("employee_id", "=", actor.employeeId)
      .orderBy("created_at", "desc")
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .execute();
    const count = await this.database
      .selectFrom("portal_favorites")
      .select((expression) => expression.fn.countAll<string>().as("total"))
      .where("employee_id", "=", actor.employeeId)
      .executeTakeFirstOrThrow();
    const items = (
      await Promise.all(
        favoriteRows.map((row) =>
          this.findResourceById(actor, row.resource_type, row.resource_id),
        ),
      )
    ).filter((item): item is PortalResourceItem => item !== null);
    return { items, total: Number(count.total), page, pageSize };
  }

  async listComments(
    type: PortalResourceType,
    resourceId: string,
  ): Promise<PortalCommentItem[]> {
    const rows =
      type === "app"
        ? await this.applicationComments(resourceId)
        : await this.nativeComments(type, resourceId);
    return rows.rows.map((row) => this.mapComment(row));
  }

  async createComment(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    body: string,
    parentCommentId: string | null,
  ): Promise<PortalCommentItem> {
    const commentId = await this.database.transaction().execute(async (trx) => {
      if (type === "app") {
        const app = await trx
          .selectFrom("applications")
          .select(["application_id", "current_version_id"])
          .where("application_id", "=", resourceId)
          .where("status", "=", "published")
          .executeTakeFirst();
        if (app?.current_version_id === null || app === undefined)
          throw new Error("PORTAL_RESOURCE_NOT_COMMENTABLE");
        if (parentCommentId !== null) {
          const parent = await trx
            .selectFrom("application_comments")
            .select(["application_id", "parent_comment_id"])
            .where("comment_id", "=", parentCommentId)
            .executeTakeFirst();
          assertPortalReplyParent(
            parent === undefined
              ? undefined
              : {
                  resourceType: "app",
                  resourceId: parent.application_id,
                  parentCommentId: parent.parent_comment_id,
                },
            "app",
            resourceId,
          );
        }
        const row = await trx
          .insertInto("application_comments")
          .values({
            application_id: resourceId,
            application_version_id: app.current_version_id,
            parent_comment_id: parentCommentId,
            author_employee_id: actor.employeeId,
            body,
            display_anonymously: false,
            comment_kind: "user",
            hidden_at: null,
          })
          .returning("comment_id")
          .executeTakeFirstOrThrow();
        return row.comment_id;
      }
      if (parentCommentId !== null) {
        const parent = await trx
          .selectFrom("portal_resource_comments")
          .select(["resource_type", "resource_id", "parent_comment_id"])
          .where("comment_id", "=", parentCommentId)
          .executeTakeFirst();
        assertPortalReplyParent(
          parent === undefined
            ? undefined
            : {
                resourceType: parent.resource_type,
                resourceId: parent.resource_id,
                parentCommentId: parent.parent_comment_id,
              },
          type,
          resourceId,
        );
      }
      const row = await trx
        .insertInto("portal_resource_comments")
        .values({
          resource_type: type,
          resource_id: resourceId,
          parent_comment_id: parentCommentId,
          author_employee_id: actor.employeeId,
          body,
          hidden_at: null,
        })
        .returning("comment_id")
        .executeTakeFirstOrThrow();
      return row.comment_id;
    });
    const item = (await this.listComments(type, resourceId)).find(
      (comment) => comment.commentId === commentId,
    );
    if (item === undefined) throw new Error("PORTAL_COMMENT_CREATE_FAILED");
    return item;
  }

  async listDashboardComments(
    actor: ActorContext,
    input: DashboardCommentQuery,
  ): Promise<{
    items: PortalCommentItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const appRows =
      input.resourceType !== undefined && input.resourceType !== "app"
        ? []
        : (await this.dashboardApplicationComments(actor, input.view)).rows;
    const nativeRows =
      input.resourceType === "app"
        ? []
        : (
            await this.dashboardNativeComments(
              actor,
              input.view,
              input.resourceType,
            )
          ).rows;
    const direction = input.sort === "latest" ? -1 : 1;
    const all = [...appRows, ...nativeRows]
      .map((row) => this.mapComment(row))
      .sort(
        (a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime()),
      );
    const offset = (input.page - 1) * input.pageSize;
    return {
      items: all.slice(offset, offset + input.pageSize),
      total: all.length,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async listDepartments() {
    const result = await sql<{
      departmentId: string;
      name: string;
      description: string;
      memberCount: string | number;
      applicationCount: string | number;
    }>`
      select d.department_id as "departmentId", d.name,
        coalesce(p.description, '') as description,
        (select count(*) from department_memberships m where m.department_id = d.department_id) as "memberCount",
        (select count(*) from applications a where a.department_id = d.department_id and a.status = 'published') as "applicationCount"
      from departments d left join portal_department_profiles p on p.department_id = d.department_id
      where d.status = 'active' order by d.name asc
    `.execute(this.database);
    return result.rows.map((row) => ({
      ...row,
      memberCount: Number(row.memberCount),
      applicationCount: Number(row.applicationCount),
    }));
  }

  async getDepartment(departmentId: string) {
    const result = await sql<{
      departmentId: string;
      name: string;
      description: string;
      metadata: unknown;
    }>`
      select d.department_id as "departmentId", d.name,
        coalesce(p.description, '') as description, coalesce(p.metadata, '{}'::jsonb) as metadata
      from departments d left join portal_department_profiles p on p.department_id = d.department_id
      where d.department_id = ${departmentId} and d.status = 'active'
    `.execute(this.database);
    return result.rows[0] ?? null;
  }

  async listDepartmentApplications(
    actor: ActorContext | null,
    departmentId: string,
  ) {
    const viewerEmployeeId = actor?.employeeId ?? null;
    const result = await sql<ResourceRow>`
      select a.application_id as resource_id, a.owner_employee_id,
        e.display_name as owner_name, a.application_id::text as slug,
        a.name, a.summary, a.status, a.current_version_id, '{}'::jsonb as metadata,
        (select count(*) from portal_favorites f where f.resource_type = 'app' and f.resource_id = a.application_id) as favorite_count,
        exists(select 1 from portal_favorites f where f.employee_id = ${viewerEmployeeId} and f.resource_type = 'app' and f.resource_id = a.application_id) as is_favorited,
        a.created_at, a.updated_at
      from applications a join employees e on e.employee_id = a.owner_employee_id
      where a.department_id = ${departmentId} and a.status = 'published'
      order by favorite_count desc, a.updated_at desc limit 48
    `.execute(this.database);
    return Promise.all(
      result.rows.map((row) => this.mapApplicationResource(row, false)),
    );
  }

  async listSkillPackages() {
    const result = await sql<{
      packageId: string;
      packageSlug: string;
      name: string;
      summary: string;
      ownerEmployeeId: string;
      ownerName: string;
      skillCount: string | number;
    }>`
      select p.skill_package_id as "packageId", p.package_slug as "packageSlug",
        p.name, p.summary, p.owner_employee_id as "ownerEmployeeId", e.display_name as "ownerName",
        (select count(*) from portal_skill_package_items i where i.skill_package_id = p.skill_package_id) as "skillCount"
      from portal_skill_packages p join employees e on e.employee_id = p.owner_employee_id
      where p.status = 'published' order by p.updated_at desc
    `.execute(this.database);
    return result.rows.map((row) => ({
      ...row,
      skillCount: Number(row.skillCount),
    }));
  }

  async getSkillPackage(packageSlug: string) {
    const result = await sql<{
      packageId: string;
      packageSlug: string;
      name: string;
      summary: string;
      ownerEmployeeId: string;
      ownerName: string;
      skills: unknown;
    }>`
      select p.skill_package_id as "packageId", p.package_slug as "packageSlug",
        p.name, p.summary, p.owner_employee_id as "ownerEmployeeId", e.display_name as "ownerName",
        coalesce(jsonb_agg(jsonb_build_object(
          'skillId', s.skill_id, 'skillSlug', s.skill_slug, 'name', s.name, 'summary', s.summary,
          'ownerEmployeeId', s.owner_employee_id, 'ownerName', se.display_name
        ) order by i.sort_order) filter (where s.skill_id is not null), '[]'::jsonb) as skills
      from portal_skill_packages p
      join employees e on e.employee_id = p.owner_employee_id
      left join portal_skill_package_items i on i.skill_package_id = p.skill_package_id
      left join portal_skills s on s.skill_id = i.skill_id and s.status = 'published'
      left join employees se on se.employee_id = s.owner_employee_id
      where p.package_slug = ${packageSlug} and p.status = 'published'
      group by p.skill_package_id, e.display_name
    `.execute(this.database);
    return result.rows[0] ?? null;
  }

  async listHunt(actor: ActorContext | null) {
    const viewerEmployeeId = actor?.employeeId ?? null;
    const result = await sql<{
      periodId: string;
      periodName: string;
      periodStatus: string;
      entryId: string;
      applicationId: string;
      name: string;
      summary: string;
      voteCount: string | number;
      hasVoted: boolean;
    }>`
      select p.period_id as "periodId", p.name as "periodName", p.status as "periodStatus",
        e.entry_id as "entryId", a.application_id as "applicationId", a.name, a.summary,
        (select count(*) from portal_app_hunt_votes v where v.entry_id = e.entry_id and v.active) as "voteCount",
        exists(select 1 from portal_app_hunt_votes v where v.period_id = p.period_id and v.entry_id = e.entry_id and v.employee_id = ${viewerEmployeeId} and v.active) as "hasVoted"
      from portal_app_hunt_periods p
      join portal_app_hunt_entries e on e.period_id = p.period_id
      join applications a on a.application_id = e.application_id and a.status = 'published'
      where p.status in ('active', 'closed')
      order by p.starts_at desc, "voteCount" desc, e.created_at asc
    `.execute(this.database);
    return result.rows.map((row) => ({
      ...row,
      voteCount: Number(row.voteCount),
    }));
  }

  async voteHunt(actor: ActorContext, periodId: string, entryId: string) {
    return this.database.transaction().execute(async (trx) => {
      await sql`
        select period_id from portal_app_hunt_periods
        where period_id = ${periodId}
        for update
      `.execute(trx);
      const entry = await trx
        .selectFrom("portal_app_hunt_entries as e")
        .innerJoin("portal_app_hunt_periods as p", "p.period_id", "e.period_id")
        .select(["e.entry_id", "p.status", "p.starts_at", "p.ends_at"])
        .where("e.entry_id", "=", entryId)
        .where("e.period_id", "=", periodId)
        .executeTakeFirst();
      const now = new Date();
      if (entry === undefined) throw new Error("PORTAL_HUNT_ENTRY_NOT_FOUND");
      if (
        entry.status !== "active" ||
        entry.starts_at > now ||
        entry.ends_at <= now
      ) {
        throw new Error("PORTAL_HUNT_PERIOD_NOT_ACTIVE");
      }
      await trx
        .updateTable("portal_app_hunt_votes")
        .set({ active: false, updated_at: now })
        .where("period_id", "=", periodId)
        .where("employee_id", "=", actor.employeeId)
        .where("entry_id", "!=", entryId)
        .where("active", "=", true)
        .execute();
      await trx
        .insertInto("portal_app_hunt_votes")
        .values({
          period_id: periodId,
          entry_id: entryId,
          employee_id: actor.employeeId,
          active: true,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["period_id", "entry_id", "employee_id"])
            .doUpdateSet({
              active: true,
              updated_at: new Date(),
            }),
        )
        .execute();
      return { periodId, entryId, active: true };
    });
  }

  async getContentPage(pageKey: string) {
    const row = await this.database
      .selectFrom("portal_content_pages")
      .select([
        "page_key",
        "title",
        "body_markdown",
        "summary",
        "published_at",
        "updated_at",
      ])
      .where("page_key", "=", pageKey)
      .where("status", "=", "published")
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          pageKey: row.page_key,
          title: row.title,
          bodyMarkdown: row.body_markdown,
          summary: row.summary.trim() || defaultContentSummary(row.page_key),
          publishedAt: row.published_at,
          updatedAt: row.updated_at,
        };
  }

  async dashboardSummary(actor: ActorContext) {
    const [result, recent] = await Promise.all([
      sql<{
        apps: string | number;
        skills: string | number;
        plugins: string | number;
        mcps: string | number;
        favorites: string | number;
      }>`
      select
        (select count(*) from applications where owner_employee_id = ${actor.employeeId}) as apps,
        (select count(*) from portal_skills where owner_employee_id = ${actor.employeeId}) as skills,
        (select count(*) from portal_plugins where owner_employee_id = ${actor.employeeId}) as plugins,
        (select count(*) from portal_mcps where owner_employee_id = ${actor.employeeId}) as mcps,
        (select count(*) from portal_favorites where employee_id = ${actor.employeeId}) as favorites
    `.execute(this.database),
      sql<{
        resourceType: PortalResourceType;
        resourceId: string;
        name: string;
        status: PortalResourceStatus;
        updatedAt: Date;
      }>`
      select * from (
        select 'app'::text as "resourceType", application_id as "resourceId", name, status, updated_at as "updatedAt"
        from applications where owner_employee_id = ${actor.employeeId}
        union all
        select 'skill', skill_id, name, status, updated_at from portal_skills where owner_employee_id = ${actor.employeeId}
        union all
        select 'plugin', plugin_id, name, status, updated_at from portal_plugins where owner_employee_id = ${actor.employeeId}
        union all
        select 'mcp', mcp_id, name, status, updated_at from portal_mcps where owner_employee_id = ${actor.employeeId}
      ) resources order by "updatedAt" desc limit 12
    `.execute(this.database),
    ]);
    const row = result.rows[0] ?? {
      apps: 0,
      skills: 0,
      plugins: 0,
      mcps: 0,
      favorites: 0,
    };
    return {
      counts: Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, Number(value)]),
      ),
      recentResources: recent.rows,
    };
  }

  private async listNativeRows(
    actor: ActorContext | null,
    type: PortalNativeResourceType,
    query: string,
    owner: string,
    status: PortalResourceStatus,
    order: ReturnType<typeof sql>,
    limit: number,
    offset: number,
  ) {
    const config = nativeConfig[type];
    const viewerEmployeeId = actor?.employeeId ?? null;
    return sql<ResourceRow>`
      select r.${sql.ref(config.id)} as resource_id, r.owner_employee_id,
        e.display_name as owner_name, r.${sql.ref(config.slug)} as slug,
        r.name, r.summary, r.status, r.metadata,
        (select count(*) from portal_favorites f where f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as favorite_count,
        exists(select 1 from portal_favorites f where f.employee_id = ${viewerEmployeeId} and f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as is_favorited,
        r.created_at, r.updated_at
      from ${sql.table(config.table)} r join employees e on e.employee_id = r.owner_employee_id
      where r.status = ${status}
        and (${query} = '' or r.name ilike ${`%${query}%`} or r.summary ilike ${`%${query}%`})
        and (${owner} = '' or r.owner_employee_id = ${owner})
      order by ${order} limit ${limit} offset ${offset}
    `.execute(this.database);
  }

  private async countNative(
    type: PortalNativeResourceType,
    query: string,
    owner: string,
    status: PortalResourceStatus,
  ) {
    const config = nativeConfig[type];
    return sql<{ total: string | number }>`
      select count(*) as total from ${sql.table(config.table)} r
      where r.status = ${status}
        and (${query} = '' or r.name ilike ${`%${query}%`} or r.summary ilike ${`%${query}%`})
        and (${owner} = '' or r.owner_employee_id = ${owner})
    `.execute(this.database);
  }

  private async findNative(
    actor: ActorContext | null,
    type: PortalNativeResourceType,
    owner: string | null,
    slug: string,
    canReview: boolean,
  ) {
    const config = nativeConfig[type];
    const viewerEmployeeId = actor?.employeeId ?? null;
    return sql<ResourceRow>`
      select r.${sql.ref(config.id)} as resource_id, r.owner_employee_id,
        e.display_name as owner_name, r.${sql.ref(config.slug)} as slug,
        r.name, r.summary, r.status, r.metadata,
        (select count(*) from portal_favorites f where f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as favorite_count,
        exists(select 1 from portal_favorites f where f.employee_id = ${viewerEmployeeId} and f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as is_favorited,
        r.created_at, r.updated_at
      from ${sql.table(config.table)} r join employees e on e.employee_id = r.owner_employee_id
      where r.${sql.ref(config.slug)} = ${slug}
        and (${owner}::text is null or r.owner_employee_id = ${owner})
        and (r.status = 'published' or r.owner_employee_id = ${viewerEmployeeId} or ${canReview})
      limit 1
    `.execute(this.database);
  }

  async findResourceById(
    actor: ActorContext | null,
    type: PortalResourceType,
    id: string,
  ): Promise<PortalResourceItem | null> {
    if (type === "app") return this.findResource(actor, type, null, id);
    const config = nativeConfig[type];
    const slug = await sql<{ slug: string }>`
      select ${sql.ref(config.slug)} as slug from ${sql.table(config.table)} where ${sql.ref(config.id)} = ${id}
    `.execute(this.database);
    const value = slug.rows[0]?.slug;
    return value === undefined
      ? null
      : this.findResource(actor, type, null, value);
  }

  private applicationComments(resourceId: string) {
    return sql<CommentRow>`
      select c.comment_id, 'app'::text as resource_type, c.application_id as resource_id,
        a.name as resource_name, a.application_id::text as resource_slug, a.owner_employee_id, c.body, c.parent_comment_id,
        p.body as parent_body, c.author_employee_id, e.display_name as author_name,
        p.author_employee_id as parent_author_employee_id, pe.display_name as parent_author_name,
        c.created_at
      from application_comments c
      join applications a on a.application_id = c.application_id
      join employees e on e.employee_id = c.author_employee_id
      left join application_comments p on p.comment_id = c.parent_comment_id
      left join employees pe on pe.employee_id = p.author_employee_id
      where c.application_id = ${resourceId} and c.hidden_at is null
      order by c.created_at asc
    `.execute(this.database);
  }

  private nativeComments(type: PortalNativeResourceType, resourceId: string) {
    const config = nativeConfig[type];
    return sql<CommentRow>`
      select c.comment_id, c.resource_type, c.resource_id, r.name as resource_name,
        r.${sql.ref(config.slug)} as resource_slug, r.owner_employee_id, c.body, c.parent_comment_id, p.body as parent_body,
        c.author_employee_id, e.display_name as author_name,
        p.author_employee_id as parent_author_employee_id, pe.display_name as parent_author_name,
        c.created_at
      from portal_resource_comments c
      join ${sql.table(config.table)} r on r.${sql.ref(config.id)} = c.resource_id
      join employees e on e.employee_id = c.author_employee_id
      left join portal_resource_comments p on p.comment_id = c.parent_comment_id
      left join employees pe on pe.employee_id = p.author_employee_id
      where c.resource_type = ${type} and c.resource_id = ${resourceId} and c.hidden_at is null
      order by c.created_at asc
    `.execute(this.database);
  }

  private dashboardApplicationComments(
    actor: ActorContext,
    view: "replies" | "mine",
  ) {
    return sql<CommentRow>`
      select c.comment_id, 'app'::text as resource_type, c.application_id as resource_id,
        a.name as resource_name, a.application_id::text as resource_slug, a.owner_employee_id, c.body, c.parent_comment_id,
        p.body as parent_body, c.author_employee_id, e.display_name as author_name,
        p.author_employee_id as parent_author_employee_id, pe.display_name as parent_author_name,
        c.created_at
      from application_comments c
      join applications a on a.application_id = c.application_id
      join employees e on e.employee_id = c.author_employee_id
      left join application_comments p on p.comment_id = c.parent_comment_id
      left join employees pe on pe.employee_id = p.author_employee_id
      where c.hidden_at is null and (
        (${view} = 'mine' and c.author_employee_id = ${actor.employeeId} and a.owner_employee_id <> ${actor.employeeId})
        or (${view} = 'replies' and p.author_employee_id = ${actor.employeeId} and p.parent_comment_id is null and c.author_employee_id <> ${actor.employeeId})
      )
    `.execute(this.database);
  }

  private dashboardNativeComments(
    actor: ActorContext,
    view: "replies" | "mine",
    type?: PortalNativeResourceType,
  ) {
    return sql<CommentRow>`
      select c.comment_id, c.resource_type, c.resource_id,
        case c.resource_type
          when 'skill' then (select name from portal_skills where skill_id = c.resource_id)
          when 'plugin' then (select name from portal_plugins where plugin_id = c.resource_id)
          else (select name from portal_mcps where mcp_id = c.resource_id)
        end as resource_name,
        case c.resource_type
          when 'skill' then (select skill_slug from portal_skills where skill_id = c.resource_id)
          when 'plugin' then (select plugin_slug from portal_plugins where plugin_id = c.resource_id)
          else (select mcp_slug from portal_mcps where mcp_id = c.resource_id)
        end as resource_slug,
        case c.resource_type
          when 'skill' then (select owner_employee_id from portal_skills where skill_id = c.resource_id)
          when 'plugin' then (select owner_employee_id from portal_plugins where plugin_id = c.resource_id)
          else (select owner_employee_id from portal_mcps where mcp_id = c.resource_id)
        end as owner_employee_id,
        c.body, c.parent_comment_id, p.body as parent_body,
        c.author_employee_id, e.display_name as author_name,
        p.author_employee_id as parent_author_employee_id, pe.display_name as parent_author_name,
        c.created_at
      from portal_resource_comments c
      join employees e on e.employee_id = c.author_employee_id
      left join portal_resource_comments p on p.comment_id = c.parent_comment_id
      left join employees pe on pe.employee_id = p.author_employee_id
      where c.hidden_at is null
        and (${type ?? ""} = '' or c.resource_type = ${type ?? ""})
        and (
          (${view} = 'mine' and c.author_employee_id = ${actor.employeeId} and (
            case c.resource_type
              when 'skill' then (select owner_employee_id from portal_skills where skill_id = c.resource_id)
              when 'plugin' then (select owner_employee_id from portal_plugins where plugin_id = c.resource_id)
              else (select owner_employee_id from portal_mcps where mcp_id = c.resource_id)
            end
          ) <> ${actor.employeeId})
          or (${view} = 'replies' and p.author_employee_id = ${actor.employeeId} and p.parent_comment_id is null and c.author_employee_id <> ${actor.employeeId})
        )
    `.execute(this.database);
  }

  private async mapApplicationResource(
    row: ResourceRow,
    detail: boolean,
  ): Promise<PortalResourceItem> {
    const metadata = await this.buildApplicationMetadata(
      row.resource_id,
      row.current_version_id ?? null,
      row.status,
      detail,
    );
    return this.mapResource("app", { ...row, metadata });
  }

  private async buildApplicationMetadata(
    applicationId: string,
    currentVersionId: string | null,
    status: PortalResourceStatus,
    detail: boolean,
  ): Promise<Record<string, unknown>> {
    const version =
      currentVersionId !== null
        ? await sql<{
            applicationVersionId: string;
            version: string;
            scanStatus: "pending" | "passed" | "failed";
            createdAt: Date;
            payload: unknown;
          }>`
            select v.application_version_id as "applicationVersionId", v.version,
              v.scan_status as "scanStatus", v.created_at as "createdAt",
              s.payload
            from application_versions v
            left join application_version_snapshots s
              on s.application_version_id = v.application_version_id
            where v.application_version_id = ${currentVersionId}
            limit 1
          `
            .execute(this.database)
            .then((result) => result.rows[0] ?? null)
        : ["in_review", "approved"].includes(status)
          ? await sql<{
              applicationVersionId: string;
              version: string;
              scanStatus: "pending" | "passed" | "failed";
              createdAt: Date;
              payload: unknown;
            }>`
              select v.application_version_id as "applicationVersionId", v.version,
                v.scan_status as "scanStatus", v.created_at as "createdAt",
                s.payload
              from application_versions v
              join application_version_snapshots s
                on s.application_version_id = v.application_version_id
              where v.application_id = ${applicationId}
              order by v.created_at desc
              limit 1
            `
              .execute(this.database)
              .then((result) => result.rows[0] ?? null)
          : null;
    const draft =
      version === null
        ? await sql<{ payload: unknown }>`
            select draft as payload from application_drafts
            where application_id = ${applicationId}
            limit 1
          `
            .execute(this.database)
            .then((result) => result.rows[0]?.payload ?? null)
        : null;
    const [catalog, tags, deliveries, assets] = await Promise.all([
      sql<{
        departmentId: string;
        departmentName: string;
      }>`
        select a.department_id as "departmentId", d.name as "departmentName"
        from applications a join departments d on d.department_id = a.department_id
        where a.application_id = ${applicationId}
      `
        .execute(this.database)
        .then((result) => result.rows[0] ?? null),
      sql<{ name: string }>`
        select t.name from application_tag_links l
        join catalog_tags t on t.tag_id = l.tag_id
        where l.application_id = ${applicationId} and t.enabled = true
        order by t.name
      `
        .execute(this.database)
        .then((result) => result.rows.map((item) => item.name)),
      sql<{
        channel: string;
        targets: unknown;
      }>`
        select d.channel,
          coalesce(jsonb_agg(jsonb_build_object(
            'kind', t.kind, 'os', t.os, 'platform', t.platform
          ) order by t.created_at) filter (where t.delivery_target_id is not null), '[]'::jsonb) as targets
        from application_deliveries d
        left join delivery_targets t on t.delivery_id = d.delivery_id and t.enabled = true
        where d.application_id = ${applicationId} and d.enabled = true and ${detail}
        group by d.delivery_id, d.channel, d.created_at
        order by d.created_at
      `
        .execute(this.database)
        .then((result) => result.rows),
      sql<{
        assetId: string;
        assetType: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
        scanStatus: "pending" | "passed" | "failed";
      }>`
        select asset_id as "assetId", asset_type as "assetType", name,
          mime_type as "mimeType", size_bytes as "sizeBytes", scan_status as "scanStatus"
        from application_assets
        where application_id = ${applicationId}
          and (${detail} or asset_type = 'icon')
        order by sort_order, created_at, asset_id
      `
        .execute(this.database)
        .then((result) => result.rows),
    ]);

    const source = isObjectRecord(version?.payload)
      ? version.payload
      : isObjectRecord(draft)
        ? draft
        : {};
    const iconAssetId =
      isObjectRecord(source.icon) && typeof source.icon.assetId === "string"
        ? source.icon.assetId
        : null;
    const screenshotAssetIds = stringArray(source.screenshotAssetIds);
    const attachmentAssetIds = [
      ...stringArray(source.attachmentAssetIds),
      ...(typeof source.manualAssetId === "string"
        ? [source.manualAssetId]
        : []),
      ...(typeof source.examplesAssetId === "string"
        ? [source.examplesAssetId]
        : []),
    ];
    const resolvedTags = Array.isArray(source.tagIds)
      ? stringArray(source.tagIds).length === 0
        ? []
        : await sql<{ name: string }>`
              select name from catalog_tags
              where enabled = true
                and tag_id in (${sql.join(
                  stringArray(source.tagIds).map((tagId) => sql`${tagId}`),
                )})
              order by name
            `
            .execute(this.database)
            .then((result) => result.rows.map((item) => item.name))
      : tags;
    const sourceDepartmentId =
      typeof source.departmentId === "string" ? source.departmentId : null;
    const resolvedCatalog =
      sourceDepartmentId !== null &&
      (catalog === null || catalog.departmentId !== sourceDepartmentId)
        ? await sql<{
            departmentId: string;
            departmentName: string;
          }>`
            select department_id as "departmentId", name as "departmentName"
            from departments
            where department_id = ${sourceDepartmentId}
          `
            .execute(this.database)
            .then((result) => result.rows[0] ?? catalog)
        : catalog;
    const referencedAssetIds = new Set([
      ...(iconAssetId === null ? [] : [iconAssetId]),
      ...screenshotAssetIds,
      ...attachmentAssetIds,
    ]);
    const referencedAssets = assets.filter((asset) =>
      referencedAssetIds.has(asset.assetId),
    );
    const selectedAssets = referencedAssets.filter(
      (asset) => asset.scanStatus === "passed",
    );
    const assetUrl = (assetId: string) =>
      `/internal/portal/apps/${applicationId}/assets/${assetId}/content`;
    const metadata: Record<string, unknown> = {
      ...(resolvedCatalog === null
        ? {}
        : {
            departmentId: resolvedCatalog.departmentId,
            departmentName: resolvedCatalog.departmentName,
          }),
      tags: resolvedTags,
      ...(Array.isArray(source.customTagNames)
        ? { customTagNames: source.customTagNames }
        : {}),
      ...(iconAssetId !== null &&
      selectedAssets.some((asset) => asset.assetId === iconAssetId)
        ? { iconUrl: assetUrl(iconAssetId) }
        : {}),
    };
    if (!detail) return metadata;

    const screenshots = screenshotAssetIds
      .filter((assetId) =>
        selectedAssets.some((asset) => asset.assetId === assetId),
      )
      .map(assetUrl);
    const files = attachmentAssetIds
      .map((assetId) =>
        selectedAssets.find((asset) => asset.assetId === assetId),
      )
      .filter(
        (asset): asset is (typeof selectedAssets)[number] =>
          asset !== undefined,
      )
      .filter((asset) => asset.assetType === "attachment")
      .map((asset) => ({
        id: asset.assetId,
        name: asset.name,
        path: asset.name,
        type: "file",
        size: asset.sizeBytes,
        language: languageForMime(asset.mimeType),
        downloadUrl: assetUrl(asset.assetId),
      }));
    const statuses = [
      ...(version === null ? [] : [version.scanStatus]),
      ...referencedAssets.map((asset) => asset.scanStatus),
    ];
    const securityStatus =
      version === null
        ? "unknown"
        : statuses.includes("failed")
          ? "failed"
          : statuses.includes("pending")
            ? "pending"
            : "passed";
    const publishedAt =
      currentVersionId === null || version === null
        ? null
        : await sql<{ createdAt: Date }>`
            select created_at as "createdAt" from application_audit_events
            where application_id = ${applicationId}
              and application_version_id = ${currentVersionId}
              and event_type = 'application.published'
            order by created_at desc limit 1
          `
            .execute(this.database)
            .then((result) => result.rows[0]?.createdAt ?? version.createdAt);
    const projectedDeliveries = Array.isArray(source.deliveries)
      ? source.deliveries.filter(isObjectRecord).map((delivery) => ({
          channel:
            typeof delivery.channel === "string" ? delivery.channel : "web",
          targets: delivery.targets ?? [],
        }))
      : deliveries;
    const compatibility = compatibilityLabels(projectedDeliveries);
    const deliveryTypes = projectedDeliveries.map((delivery) =>
      deliveryTypeLabel(delivery.channel),
    );
    const summaryHtml =
      typeof source.summaryHtml === "string" ? source.summaryHtml : "";
    metadata.summaryHtml = summaryHtml;
    metadata.overview = summaryHtml;
    metadata.readme =
      typeof source.manualHtml === "string" ? source.manualHtml : summaryHtml;
    metadata.version =
      version?.version ??
      (typeof source.version === "string" ? source.version : "");
    metadata.compatibility = compatibility;
    metadata.deliveryTypes = deliveryTypes;
    metadata.screenshots = screenshots;
    metadata.securityStatus = securityStatus;
    if (publishedAt !== null) metadata.publishedAt = publishedAt.toISOString();
    metadata.files = files;
    return metadata;
  }

  private mapResource(
    type: PortalResourceType,
    row: ResourceRow,
  ): PortalResourceItem {
    return {
      resourceId: row.resource_id,
      resourceType: type,
      ownerEmployeeId: row.owner_employee_id,
      ownerName: row.owner_name,
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      status: row.status,
      ...(type === "app"
        ? { currentVersionId: row.current_version_id ?? null }
        : {}),
      metadata: redactPortalMetadata(row.metadata),
      favoriteCount: toNumber(row.favorite_count),
      isFavorited: row.is_favorited,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapComment(row: CommentRow): PortalCommentItem {
    const owner = row.owner_employee_id;
    const href =
      row.resource_type === "app"
        ? `/apps/${owner}/${row.resource_slug}#comment-${row.comment_id}`
        : row.resource_type === "mcp"
          ? `/mcp/${row.resource_slug}#comment-${row.comment_id}`
          : `/${row.resource_type === "plugin" ? "plugins" : "skills"}/${owner}/${row.resource_slug}#comment-${row.comment_id}`;
    return {
      commentId: row.comment_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      resourceName: row.resource_name,
      resourceHref: href,
      body: row.body,
      kind: row.parent_comment_id === null ? "comment" : "reply",
      author: {
        employeeId: row.author_employee_id,
        displayName: row.author_name,
      },
      parentComment:
        row.parent_comment_id === null
          ? null
          : {
              commentId: row.parent_comment_id,
              body: row.parent_body ?? "",
              author: {
                employeeId: row.parent_author_employee_id ?? "",
                displayName: row.parent_author_name ?? "",
              },
            },
      createdAt: row.created_at,
    };
  }

  private async recordOutbox(
    database: Kysely<DatabaseSchema>,
    type: PortalNativeResourceType,
    resourceId: string,
    event: string,
    actorEmployeeId: string,
  ): Promise<void> {
    await database
      .insertInto("outbox_events")
      .values({
        event_type: `portal.${type}.${event}`,
        aggregate_type: `portal_${type}`,
        aggregate_id: resourceId,
        payload: { resourceType: type, resourceId, actorEmployeeId },
        idempotency_key: `portal:${type}:${resourceId}:${event}:${randomUUID()}`,
        status: "pending",
        attempts: 0,
        available_at: new Date(),
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        completed_at: null,
      })
      .execute();
    await database
      .insertInto("security_audit_events")
      .values({
        trace_id: null,
        module: "portal",
        action: event,
        actor_employee_id: actorEmployeeId,
        subject: `${type}:${resourceId}`,
        result: "success",
        risk: "low",
        ip_address: null,
        user_agent: null,
        details: { resourceType: type, resourceId },
      })
      .execute();
  }
}
