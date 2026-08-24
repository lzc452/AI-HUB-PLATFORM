import type { ActorContext } from "@ai-hub/contracts";
import type { DatabaseSchema, PortalResourceStatus } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import type {
  DashboardCommentQuery,
  PortalCommentItem,
  PortalDraftInput,
  PortalListInput,
  PortalListResult,
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
  metadata: unknown;
  favorite_count: string | number;
  is_favorited: boolean;
  created_at: Date;
  updated_at: Date;
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
  if (Array.isArray(value)) return value.map((item) => redactPortalMetadata(item));
  if (value === null || typeof value !== "object") return value;
  const hidden = /(?:storage|object)[_-]?key|secret|password|access[_-]?token|refresh[_-]?token/i;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !hidden.test(key))
      .map(([key, nested]) => [key, redactPortalMetadata(nested)]),
  );
}

export function assertPortalReplyParent(
  parent: { resourceType: PortalResourceType; resourceId: string; parentCommentId: string | null } | undefined,
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
  if (parent.parentCommentId !== null) throw new Error("PORTAL_REPLY_DEPTH_EXCEEDED");
}

export class KyselyPortalRepository implements PortalRepository {
  constructor(private readonly database: Kysely<DatabaseSchema>) {}

  async listResources(
    actor: ActorContext,
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
    const rows =
      type === "app"
        ? await sql<ResourceRow>`
            select a.application_id as resource_id, a.owner_employee_id,
              e.display_name as owner_name, a.application_id::text as slug,
              a.name, a.summary, a.status, '{}'::jsonb as metadata,
              (select count(*) from portal_favorites f where f.resource_type = 'app' and f.resource_id = a.application_id) as favorite_count,
              exists(select 1 from portal_favorites f where f.employee_id = ${actor.employeeId} and f.resource_type = 'app' and f.resource_id = a.application_id) as is_favorited,
              a.created_at, a.updated_at
            from applications a join employees e on e.employee_id = a.owner_employee_id
            where a.status = ${statusFilter}
              and (${queryFilter} = '' or a.name ilike ${`%${queryFilter}%`} or a.summary ilike ${`%${queryFilter}%`})
              and (${ownerFilter} = '' or a.owner_employee_id = ${ownerFilter})
            order by ${order} limit ${input.pageSize} offset ${offset}
          `.execute(this.database)
        : await this.listNativeRows(actor, type, queryFilter, ownerFilter, statusFilter, order, input.pageSize, offset);
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
      items: rows.rows.map((row) => this.mapResource(type, row)),
      total: toNumber(totalResult.rows[0]?.total ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async findResource(
    actor: ActorContext,
    type: PortalResourceType,
    ownerEmployeeId: string | null,
    slug: string,
  ): Promise<PortalResourceItem | null> {
    const canReview = actor.permissions?.includes("*") === true || actor.permissions?.includes("application.review") === true;
    const result =
      type === "app"
        ? await sql<ResourceRow>`
            select a.application_id as resource_id, a.owner_employee_id,
              e.display_name as owner_name, a.application_id::text as slug,
              a.name, a.summary, a.status, '{}'::jsonb as metadata,
              (select count(*) from portal_favorites f where f.resource_type = 'app' and f.resource_id = a.application_id) as favorite_count,
              exists(select 1 from portal_favorites f where f.employee_id = ${actor.employeeId} and f.resource_type = 'app' and f.resource_id = a.application_id) as is_favorited,
              a.created_at, a.updated_at
            from applications a join employees e on e.employee_id = a.owner_employee_id
            where a.application_id::text = ${slug}
              and (${ownerEmployeeId}::text is null or a.owner_employee_id = ${ownerEmployeeId})
              and (
                a.status = 'published' or a.owner_employee_id = ${actor.employeeId}
                or a.maintainer_employee_id = ${actor.employeeId}
                or exists(select 1 from application_maintainers m where m.application_id = a.application_id and m.employee_id = ${actor.employeeId})
                or ${canReview}
              )
            limit 1
          `.execute(this.database)
        : await this.findNative(actor, type, ownerEmployeeId, slug, canReview);
    const row = result.rows[0];
    return row === undefined ? null : this.mapResource(type, row);
  }

  async createDraft(actor: ActorContext, input: PortalDraftInput): Promise<PortalResourceItem> {
    const resourceId = await this.database.transaction().execute(async (trx) => {
      if (input.resourceType === "app") {
        const result = await trx
          .insertInto("applications")
          .values({
            owner_employee_id: actor.employeeId,
            maintainer_employee_id: actor.employeeId,
            department_id: actor.primaryDepartmentId,
            name: input.name,
            summary: input.summary,
            status: "draft",
            current_version_id: null,
            pending_version_id: null,
          })
          .returning("application_id")
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("application_drafts")
          .values({ application_id: result.application_id, draft: input.metadata ?? {} })
          .execute();
        await this.recordOutbox(trx, "app", result.application_id, "draft.created", actor.employeeId);
        return result.application_id;
      }
      const config = nativeConfig[input.resourceType];
      const result = await sql<{ resource_id: string }>`
        insert into ${sql.table(config.table)}
          (owner_employee_id, ${sql.ref(config.slug)}, name, summary, metadata, status)
        values (${actor.employeeId}, ${input.slug}, ${input.name}, ${input.summary}, ${JSON.stringify(input.metadata ?? {})}::jsonb, 'draft')
        returning ${sql.ref(config.id)} as resource_id
      `.execute(trx);
      const id = result.rows[0]?.resource_id;
      if (id === undefined) throw new Error("PORTAL_DRAFT_CREATE_FAILED");
      await this.recordOutbox(trx, input.resourceType, id, "draft.created", actor.employeeId);
      return id;
    });
    const resource = await this.findResource(
      actor,
      input.resourceType,
      input.resourceType === "mcp" ? null : actor.employeeId,
      input.resourceType === "app" ? resourceId : input.slug,
    );
    if (resource === null) throw new Error("PORTAL_DRAFT_CREATE_FAILED");
    return resource;
  }

  async updateDraft(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    input: Omit<PortalDraftInput, "resourceType">,
  ): Promise<PortalResourceItem> {
    await this.database.transaction().execute(async (trx) => {
      if (type === "app") {
        const updated = await trx
          .updateTable("applications")
          .set({ name: input.name, summary: input.summary, updated_at: new Date() })
          .where("application_id", "=", resourceId)
          .where("owner_employee_id", "=", actor.employeeId)
          .where("status", "in", ["draft", "withdrawn"])
          .executeTakeFirst();
        if (Number(updated.numUpdatedRows) !== 1) throw new Error("PORTAL_RESOURCE_NOT_EDITABLE");
        await trx
          .insertInto("application_drafts")
          .values({ application_id: resourceId, draft: input.metadata ?? {} })
          .onConflict((conflict) =>
            conflict.column("application_id").doUpdateSet({
              draft: input.metadata ?? {},
              updated_at: new Date(),
            }),
          )
          .execute();
      } else {
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
        if (updated.rows.length !== 1) throw new Error("PORTAL_RESOURCE_NOT_EDITABLE");
      }
      await this.recordOutbox(trx, type, resourceId, "draft.updated", actor.employeeId);
    });
    const resource = await this.findResourceById(actor, type, resourceId);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return resource;
  }

  async saveVersion(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    input: PortalVersionInput,
  ): Promise<void> {
    await this.database.transaction().execute(async (trx) => {
      if (type === "app") {
        const inserted = await trx
          .insertInto("application_versions")
          .values({
            application_id: resourceId,
            version: input.version,
            changelog: input.changelog,
            artifact_key: null,
            artifact_sha256: null,
            artifact_signature: null,
            scan_status: "pending",
            created_by_employee_id: actor.employeeId,
          })
          .returning("application_version_id")
          .executeTakeFirstOrThrow();
        const updated = await trx
          .updateTable("applications")
          .set({ current_version_id: inserted.application_version_id, updated_at: new Date() })
          .where("application_id", "=", resourceId)
          .where("owner_employee_id", "=", actor.employeeId)
          .executeTakeFirst();
        if (Number(updated.numUpdatedRows) !== 1) throw new Error("PORTAL_RESOURCE_OWNER_REQUIRED");
        await this.recordOutbox(trx, type, resourceId, "version.created", actor.employeeId);
        return;
      }
      const config = nativeConfig[type];
      const inserted = await sql<{ version_id: string }>`
        insert into ${sql.table(config.versions)}
          (${sql.ref(config.id)}, version, changelog, metadata, scan_status, created_by_employee_id)
        values (${resourceId}, ${input.version}, ${input.changelog}, ${JSON.stringify(input.metadata ?? {})}::jsonb, 'pending', ${actor.employeeId})
        returning ${sql.ref(config.versionId)} as version_id
      `.execute(trx);
      const versionId = inserted.rows[0]?.version_id;
      if (versionId === undefined) throw new Error("PORTAL_VERSION_CREATE_FAILED");
      await sql`
        update ${sql.table(config.table)} set current_version_id = ${versionId}, updated_at = now()
        where ${sql.ref(config.id)} = ${resourceId} and owner_employee_id = ${actor.employeeId}
      `.execute(trx);
      await this.recordOutbox(trx, type, resourceId, "version.created", actor.employeeId);
    });
  }

  async transition(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    from: readonly PortalResourceStatus[],
    to: PortalResourceStatus,
  ): Promise<PortalResourceItem> {
    await this.database.transaction().execute(async (trx) => {
      const table = type === "app" ? "applications" : nativeConfig[type].table;
      const id = type === "app" ? "application_id" : nativeConfig[type].id;
      const allowed = sql.join(from.map((status) => sql`${status}`));
      const result = await sql<{ resource_id: string }>`
        update ${sql.table(table)} set status = ${to}, updated_at = now()
        where ${sql.ref(id)} = ${resourceId} and status in (${allowed})
        returning ${sql.ref(id)} as resource_id
      `.execute(trx);
      if (result.rows.length === 0) throw new Error("PORTAL_RESOURCE_STATE_CONFLICT");
      await this.recordOutbox(trx, type, resourceId, `status.${to}`, actor.employeeId);
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
        .values({ employee_id: actor.employeeId, resource_type: type, resource_id: resourceId })
        .onConflict((conflict) => conflict.columns(["employee_id", "resource_type", "resource_id"]).doNothing())
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

  async listFavorites(actor: ActorContext, page: number, pageSize: number): Promise<PortalListResult> {
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
      await Promise.all(favoriteRows.map((row) => this.findResourceById(actor, row.resource_type, row.resource_id)))
    ).filter((item): item is PortalResourceItem => item !== null);
    return { items, total: Number(count.total), page, pageSize };
  }

  async listComments(type: PortalResourceType, resourceId: string): Promise<PortalCommentItem[]> {
    const rows = type === "app" ? await this.applicationComments(resourceId) : await this.nativeComments(type, resourceId);
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
        if (app?.current_version_id === null || app === undefined) throw new Error("PORTAL_RESOURCE_NOT_COMMENTABLE");
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
    const item = (await this.listComments(type, resourceId)).find((comment) => comment.commentId === commentId);
    if (item === undefined) throw new Error("PORTAL_COMMENT_CREATE_FAILED");
    return item;
  }

  async listDashboardComments(
    actor: ActorContext,
    input: DashboardCommentQuery,
  ): Promise<{ items: PortalCommentItem[]; total: number; page: number; pageSize: number }> {
    const appRows = input.resourceType !== undefined && input.resourceType !== "app"
      ? []
      : (await this.dashboardApplicationComments(actor, input.view)).rows;
    const nativeRows = input.resourceType === "app"
      ? []
      : (await this.dashboardNativeComments(actor, input.view, input.resourceType)).rows;
    const direction = input.sort === "latest" ? -1 : 1;
    const all = [...appRows, ...nativeRows]
      .map((row) => this.mapComment(row))
      .sort((a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime()));
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

  async listDepartmentApplications(actor: ActorContext, departmentId: string) {
    const result = await sql<ResourceRow>`
      select a.application_id as resource_id, a.owner_employee_id,
        e.display_name as owner_name, a.application_id::text as slug,
        a.name, a.summary, a.status, '{}'::jsonb as metadata,
        (select count(*) from portal_favorites f where f.resource_type = 'app' and f.resource_id = a.application_id) as favorite_count,
        exists(select 1 from portal_favorites f where f.employee_id = ${actor.employeeId} and f.resource_type = 'app' and f.resource_id = a.application_id) as is_favorited,
        a.created_at, a.updated_at
      from applications a join employees e on e.employee_id = a.owner_employee_id
      where a.department_id = ${departmentId} and a.status = 'published'
      order by favorite_count desc, a.updated_at desc limit 48
    `.execute(this.database);
    return result.rows.map((row) => this.mapResource("app", row));
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
    return result.rows.map((row) => ({ ...row, skillCount: Number(row.skillCount) }));
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
          'skillId', s.skill_id, 'skillSlug', s.skill_slug, 'name', s.name, 'summary', s.summary
        ) order by i.sort_order) filter (where s.skill_id is not null), '[]'::jsonb) as skills
      from portal_skill_packages p
      join employees e on e.employee_id = p.owner_employee_id
      left join portal_skill_package_items i on i.skill_package_id = p.skill_package_id
      left join portal_skills s on s.skill_id = i.skill_id and s.status = 'published'
      where p.package_slug = ${packageSlug} and p.status = 'published'
      group by p.skill_package_id, e.display_name
    `.execute(this.database);
    return result.rows[0] ?? null;
  }

  async listHunt() {
    const result = await sql<{
      periodId: string;
      periodName: string;
      periodStatus: string;
      entryId: string;
      applicationId: string;
      name: string;
      summary: string;
      voteCount: string | number;
    }>`
      select p.period_id as "periodId", p.name as "periodName", p.status as "periodStatus",
        e.entry_id as "entryId", a.application_id as "applicationId", a.name, a.summary,
        (select count(*) from portal_app_hunt_votes v where v.entry_id = e.entry_id and v.active) as "voteCount"
      from portal_app_hunt_periods p
      join portal_app_hunt_entries e on e.period_id = p.period_id
      join applications a on a.application_id = e.application_id and a.status = 'published'
      where p.status in ('active', 'closed')
      order by p.starts_at desc, "voteCount" desc, e.created_at asc
    `.execute(this.database);
    return result.rows.map((row) => ({ ...row, voteCount: Number(row.voteCount) }));
  }

  async voteHunt(actor: ActorContext, periodId: string, entryId: string) {
    return this.database.transaction().execute(async (trx) => {
      const entry = await trx
        .selectFrom("portal_app_hunt_entries as e")
        .innerJoin("portal_app_hunt_periods as p", "p.period_id", "e.period_id")
        .select(["e.entry_id", "p.status", "p.starts_at", "p.ends_at"])
        .where("e.entry_id", "=", entryId)
        .where("e.period_id", "=", periodId)
        .executeTakeFirst();
      const now = new Date();
      if (entry === undefined) throw new Error("PORTAL_HUNT_ENTRY_NOT_FOUND");
      if (entry.status !== "active" || entry.starts_at > now || entry.ends_at <= now) {
        throw new Error("PORTAL_HUNT_PERIOD_NOT_ACTIVE");
      }
      await trx
        .insertInto("portal_app_hunt_votes")
        .values({ period_id: periodId, entry_id: entryId, employee_id: actor.employeeId, active: true })
        .onConflict((conflict) =>
          conflict.columns(["period_id", "entry_id", "employee_id"]).doUpdateSet({
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
      .select(["page_key", "title", "body_markdown", "published_at", "updated_at"])
      .where("page_key", "=", pageKey)
      .where("status", "=", "published")
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          pageKey: row.page_key,
          title: row.title,
          bodyMarkdown: row.body_markdown,
          publishedAt: row.published_at,
          updatedAt: row.updated_at,
        };
  }

  async dashboardSummary(actor: ActorContext) {
    const [result, recent] = await Promise.all([sql<{
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
    `.execute(this.database), sql<{
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
    `.execute(this.database)]);
    const row = result.rows[0] ?? { apps: 0, skills: 0, plugins: 0, mcps: 0, favorites: 0 };
    return {
      counts: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])),
      recentResources: recent.rows,
    };
  }

  private async listNativeRows(
    actor: ActorContext,
    type: PortalNativeResourceType,
    query: string,
    owner: string,
    status: PortalResourceStatus,
    order: ReturnType<typeof sql>,
    limit: number,
    offset: number,
  ) {
    const config = nativeConfig[type];
    return sql<ResourceRow>`
      select r.${sql.ref(config.id)} as resource_id, r.owner_employee_id,
        e.display_name as owner_name, r.${sql.ref(config.slug)} as slug,
        r.name, r.summary, r.status, r.metadata,
        (select count(*) from portal_favorites f where f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as favorite_count,
        exists(select 1 from portal_favorites f where f.employee_id = ${actor.employeeId} and f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as is_favorited,
        r.created_at, r.updated_at
      from ${sql.table(config.table)} r join employees e on e.employee_id = r.owner_employee_id
      where r.status = ${status}
        and (${query} = '' or r.name ilike ${`%${query}%`} or r.summary ilike ${`%${query}%`})
        and (${owner} = '' or r.owner_employee_id = ${owner})
      order by ${order} limit ${limit} offset ${offset}
    `.execute(this.database);
  }

  private async countNative(type: PortalNativeResourceType, query: string, owner: string, status: PortalResourceStatus) {
    const config = nativeConfig[type];
    return sql<{ total: string | number }>`
      select count(*) as total from ${sql.table(config.table)} r
      where r.status = ${status}
        and (${query} = '' or r.name ilike ${`%${query}%`} or r.summary ilike ${`%${query}%`})
        and (${owner} = '' or r.owner_employee_id = ${owner})
    `.execute(this.database);
  }

  private async findNative(
    actor: ActorContext,
    type: PortalNativeResourceType,
    owner: string | null,
    slug: string,
    canReview: boolean,
  ) {
    const config = nativeConfig[type];
    return sql<ResourceRow>`
      select r.${sql.ref(config.id)} as resource_id, r.owner_employee_id,
        e.display_name as owner_name, r.${sql.ref(config.slug)} as slug,
        r.name, r.summary, r.status, r.metadata,
        (select count(*) from portal_favorites f where f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as favorite_count,
        exists(select 1 from portal_favorites f where f.employee_id = ${actor.employeeId} and f.resource_type = ${type} and f.resource_id = r.${sql.ref(config.id)}) as is_favorited,
        r.created_at, r.updated_at
      from ${sql.table(config.table)} r join employees e on e.employee_id = r.owner_employee_id
      where r.${sql.ref(config.slug)} = ${slug}
        and (${owner}::text is null or r.owner_employee_id = ${owner})
        and (r.status = 'published' or r.owner_employee_id = ${actor.employeeId} or ${canReview})
      limit 1
    `.execute(this.database);
  }

  async findResourceById(actor: ActorContext, type: PortalResourceType, id: string): Promise<PortalResourceItem | null> {
    if (type === "app") return this.findResource(actor, type, null, id);
    const config = nativeConfig[type];
    const slug = await sql<{ slug: string }>`
      select ${sql.ref(config.slug)} as slug from ${sql.table(config.table)} where ${sql.ref(config.id)} = ${id}
    `.execute(this.database);
    const value = slug.rows[0]?.slug;
    return value === undefined ? null : this.findResource(actor, type, null, value);
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

  private dashboardApplicationComments(actor: ActorContext, view: "replies" | "mine") {
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

  private dashboardNativeComments(actor: ActorContext, view: "replies" | "mine", type?: PortalNativeResourceType) {
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

  private mapResource(type: PortalResourceType, row: ResourceRow): PortalResourceItem {
    return {
      resourceId: row.resource_id,
      resourceType: type,
      ownerEmployeeId: row.owner_employee_id,
      ownerName: row.owner_name,
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      status: row.status,
      metadata: redactPortalMetadata(row.metadata),
      favoriteCount: toNumber(row.favorite_count),
      isFavorited: row.is_favorited,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapComment(row: CommentRow): PortalCommentItem {
    const owner = row.owner_employee_id;
    const href = row.resource_type === "app"
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
      author: { employeeId: row.author_employee_id, displayName: row.author_name },
      parentComment: row.parent_comment_id === null
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
    type: PortalResourceType,
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
