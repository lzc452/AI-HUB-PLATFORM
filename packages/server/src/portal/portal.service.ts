import { hasPermission, PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import { KyselyPortalRepository } from "./portal.repository.js";
import type {
  DashboardCommentQuery,
  PortalDraftInput,
  PortalListInput,
  PortalResourceType,
  PortalVersionInput,
} from "./portal.types.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PortalService {
  constructor(private readonly repository: KyselyPortalRepository) {}

  async home(actor: ActorContext) {
    const [apps, skills, plugins, mcps, departments, packages, updates] = await Promise.all([
      this.repository.listResources(actor, "app", this.featuredQuery()),
      this.repository.listResources(actor, "skill", this.featuredQuery()),
      this.repository.listResources(actor, "plugin", this.featuredQuery()),
      this.repository.listResources(actor, "mcp", this.featuredQuery()),
      this.repository.listDepartments(),
      this.repository.listSkillPackages(),
      this.repository.getContentPage("updates"),
    ]);
    return {
      apps: apps.items,
      skills: skills.items,
      plugins: plugins.items,
      mcps: mcps.items,
      departments: departments.slice(0, 8),
      skillPackages: packages.slice(0, 8),
      updates,
    };
  }

  list(actor: ActorContext, type: PortalResourceType, input: PortalListInput) {
    if (
      input.status !== undefined &&
      input.status !== "published" &&
      input.ownerEmployeeId !== actor.employeeId &&
      !hasPermission(actor, PERMISSIONS.APPLICATION_REVIEW)
    ) {
      throw new Error("PORTAL_RESOURCE_LIST_FORBIDDEN");
    }
    return this.repository.listResources(actor, type, input);
  }

  async detail(actor: ActorContext, type: PortalResourceType, ownerEmployeeId: string | null, slug: string) {
    const resource = await this.repository.findResource(actor, type, ownerEmployeeId, slug);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return resource;
  }

  async createDraft(actor: ActorContext, input: PortalDraftInput) {
    if (!hasPermission(actor, PERMISSIONS.APPLICATION_CREATE)) throw new Error("PORTAL_PUBLISH_FORBIDDEN");
    const normalized = this.normalizeDraft(input);
    return this.repository.createDraft(actor, { ...input, ...normalized });
  }

  async updateDraft(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    input: Omit<PortalDraftInput, "resourceType">,
  ) {
    await this.requireOwned(actor, type, resourceId);
    return this.repository.updateDraft(actor, type, resourceId, {
      ...input,
      ...this.normalizeDraft({ ...input, resourceType: type }),
    });
  }

  async saveVersion(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    input: PortalVersionInput,
  ) {
    const resource = await this.requireOwned(actor, type, resourceId);
    if (!["draft", "withdrawn"].includes(resource.status)) throw new Error("PORTAL_RESOURCE_NOT_EDITABLE");
    const version = input.version.trim();
    if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(version)) throw new Error("PORTAL_VERSION_INVALID");
    await this.repository.saveVersion(actor, type, resourceId, {
      ...input,
      version,
      changelog: input.changelog.trim(),
    });
    return { resourceId, resourceType: type, version };
  }

  async submit(actor: ActorContext, type: PortalResourceType, resourceId: string) {
    await this.requireOwned(actor, type, resourceId);
    return this.repository.transition(actor, type, resourceId, ["draft", "withdrawn"], "in_review");
  }

  async approve(actor: ActorContext, type: PortalResourceType, resourceId: string) {
    if (!hasPermission(actor, PERMISSIONS.APPLICATION_REVIEW)) throw new Error("PORTAL_REVIEW_FORBIDDEN");
    const resource = await this.repository.findResourceById(actor, type, resourceId);
    if (resource?.ownerEmployeeId === actor.employeeId) throw new Error("PORTAL_SELF_REVIEW_FORBIDDEN");
    return this.repository.transition(actor, type, resourceId, ["in_review"], "approved");
  }

  async requestChanges(actor: ActorContext, type: PortalResourceType, resourceId: string) {
    if (!hasPermission(actor, PERMISSIONS.APPLICATION_REVIEW)) throw new Error("PORTAL_REVIEW_FORBIDDEN");
    const resource = await this.repository.findResourceById(actor, type, resourceId);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    if (resource.ownerEmployeeId === actor.employeeId) throw new Error("PORTAL_SELF_REVIEW_FORBIDDEN");
    return this.repository.transition(actor, type, resourceId, ["in_review"], "draft");
  }

  async publish(actor: ActorContext, type: PortalResourceType, resourceId: string) {
    const resource = await this.requireOwnedOrPermission(actor, type, resourceId, PERMISSIONS.APPLICATION_PUBLISH);
    return this.repository.transition(actor, type, resource.resourceId, ["approved"], "published");
  }

  async withdraw(actor: ActorContext, type: PortalResourceType, resourceId: string) {
    await this.requireOwned(actor, type, resourceId);
    return this.repository.transition(actor, type, resourceId, ["published", "in_review", "approved"], "withdrawn");
  }

  async favorite(actor: ActorContext, type: PortalResourceType, resourceId: string, active: boolean) {
    const resource = await this.repository.findResourceById(actor, type, resourceId);
    if (resource === null || resource.status !== "published") throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return { resourceId, resourceType: type, active: await this.repository.setFavorite(actor, type, resourceId, active) };
  }

  async listComments(actor: ActorContext, type: PortalResourceType, resourceId: string) {
    const resource = await this.repository.findResourceById(actor, type, resourceId);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    return this.repository.listComments(type, resourceId);
  }

  async createComment(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    body: string,
    parentCommentId: string | null,
  ) {
    if (!hasPermission(actor, PERMISSIONS.INTERACTION_INTERACT)) throw new Error("PORTAL_COMMENT_FORBIDDEN");
    const normalized = body.trim();
    if (normalized.length < 1 || normalized.length > 4000) throw new Error("PORTAL_COMMENT_BODY_INVALID");
    const resource = await this.repository.findResourceById(actor, type, resourceId);
    if (resource === null || resource.status !== "published") throw new Error("PORTAL_RESOURCE_NOT_COMMENTABLE");
    return this.repository.createComment(actor, type, resourceId, normalized, parentCommentId);
  }

  dashboardComments(actor: ActorContext, input: DashboardCommentQuery) {
    return this.repository.listDashboardComments(actor, input);
  }

  dashboard(actor: ActorContext) {
    return this.repository.dashboardSummary(actor);
  }

  stars(actor: ActorContext, page: number, pageSize: number) {
    return this.repository.listFavorites(actor, page, pageSize);
  }

  departments() {
    return this.repository.listDepartments();
  }

  async department(actor: ActorContext, departmentId: string) {
    const [profile, applications] = await Promise.all([
      this.repository.getDepartment(departmentId),
      this.repository.listDepartmentApplications(actor, departmentId),
    ]);
    if (profile === null) throw new Error("PORTAL_DEPARTMENT_NOT_FOUND");
    return { ...profile, applications };
  }

  skillPackages() {
    return this.repository.listSkillPackages();
  }

  async skillPackage(packageSlug: string) {
    const value = await this.repository.getSkillPackage(packageSlug);
    if (value === null) throw new Error("PORTAL_SKILL_PACKAGE_NOT_FOUND");
    return value;
  }

  hunt() {
    return this.repository.listHunt();
  }

  voteHunt(actor: ActorContext, periodId: string, entryId: string) {
    return this.repository.voteHunt(actor, periodId, entryId);
  }

  async doc(pageKey: "tutorials" | "about" | "updates") {
    const value = await this.repository.getContentPage(pageKey);
    if (value === null) throw new Error("PORTAL_CONTENT_PAGE_NOT_FOUND");
    return value;
  }

  private featuredQuery(): PortalListInput {
    return { sortBy: "score", page: 1, pageSize: 8, status: "published" };
  }

  private normalizeDraft(input: PortalDraftInput) {
    const slug = input.slug.trim().toLowerCase();
    if (!slugPattern.test(slug) || slug.length > 120) throw new Error("PORTAL_SLUG_INVALID");
    const name = input.name.trim();
    const summary = input.summary.trim();
    if (name.length < 2 || name.length > 160) throw new Error("PORTAL_NAME_INVALID");
    if (summary.length < 2 || summary.length > 2000) throw new Error("PORTAL_SUMMARY_INVALID");
    return { slug, name, summary };
  }

  private async requireOwned(actor: ActorContext, type: PortalResourceType, resourceId: string) {
    const resource = await this.repository.findResourceById(actor, type, resourceId);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    if (resource.ownerEmployeeId !== actor.employeeId) throw new Error("PORTAL_RESOURCE_OWNER_REQUIRED");
    return resource;
  }

  private async requireOwnedOrPermission(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    permission: string,
  ) {
    const resource = await this.repository.findResourceById(actor, type, resourceId);
    if (resource === null) throw new Error("PORTAL_RESOURCE_NOT_FOUND");
    if (resource.ownerEmployeeId !== actor.employeeId && !hasPermission(actor, permission)) {
      throw new Error("PORTAL_RESOURCE_OWNER_REQUIRED");
    }
    return resource;
  }
}
