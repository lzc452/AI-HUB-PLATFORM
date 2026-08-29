import type { ActorContext, ApplicationDraft } from "@ai-hub/contracts";
import type { PortalResourceStatus } from "@ai-hub/database";

export type PortalResourceType = "app" | "skill" | "plugin" | "mcp";
export type PortalNativeResourceType = Exclude<PortalResourceType, "app">;

export interface PortalListInput {
  query?: string;
  ownerEmployeeId?: string;
  status?: PortalResourceStatus;
  sortBy: "score" | "latest" | "name";
  page: number;
  pageSize: number;
}

export interface PortalResourceItem {
  resourceId: string;
  resourceType: PortalResourceType;
  ownerEmployeeId: string;
  ownerName: string;
  slug: string;
  name: string;
  summary: string;
  status: PortalResourceStatus;
  /** app 对应 Application 的当前已生效版本；Portal 自有资源不返回该字段。 */
  currentVersionId?: string | null;
  metadata: unknown;
  favoriteCount: number;
  isFavorited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalListResult {
  items: PortalResourceItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PortalApplicationDraftDetail {
  resource: PortalResourceItem;
  applicationDraft: ApplicationDraft;
  draftUpdatedAt: string;
}

export interface PortalDraftInput {
  resourceType: PortalResourceType;
  slug: string;
  name: string;
  summary: string;
  metadata?: unknown;
  /**
   * Portal 写入 app 时使用的标准应用草稿。`metadata` 仅保留为旧调用方的
   * 兼容输入；实际持久化统一委托 ApplicationService。
   */
  applicationDraft?: ApplicationDraft;
}

/** Portal 自有资源的写入输入；app 不得再经 PortalRepository 写入。 */
export interface PortalNativeDraftInput
  extends Omit<PortalDraftInput, "resourceType"> {
  resourceType: PortalNativeResourceType;
}

export interface PortalVersionInput {
  version: string;
  changelog: string;
  metadata?: unknown;
}

export interface PortalCommentItem {
  commentId: string;
  resourceType: PortalResourceType;
  resourceId: string;
  resourceName: string;
  resourceHref: string;
  body: string;
  kind: "comment" | "reply";
  author: {
    employeeId: string;
    displayName: string;
  };
  parentComment: {
    commentId: string;
    body: string;
    author: {
      employeeId: string;
      displayName: string;
    };
  } | null;
  createdAt: Date;
}

export interface DashboardCommentQuery {
  view: "replies" | "mine";
  resourceType?: PortalResourceType;
  sort: "latest" | "oldest";
  page: number;
  pageSize: number;
}

export interface PortalRepository {
  listResources(
    actor: ActorContext | null,
    type: PortalResourceType,
    input: PortalListInput,
  ): Promise<PortalListResult>;
  findResource(
    actor: ActorContext | null,
    type: PortalResourceType,
    ownerEmployeeId: string | null,
    slug: string,
  ): Promise<PortalResourceItem | null>;
  findResourceById(
    actor: ActorContext | null,
    type: PortalResourceType,
    resourceId: string,
  ): Promise<PortalResourceItem | null>;
  createDraft(
    actor: ActorContext,
    input: PortalNativeDraftInput,
  ): Promise<PortalResourceItem>;
  updateDraft(
    actor: ActorContext,
    type: PortalNativeResourceType,
    resourceId: string,
    input: Omit<PortalNativeDraftInput, "resourceType">,
  ): Promise<PortalResourceItem>;
  saveVersion(
    actor: ActorContext,
    type: PortalNativeResourceType,
    resourceId: string,
    input: PortalVersionInput,
  ): Promise<void>;
  transition(
    actor: ActorContext,
    type: PortalNativeResourceType,
    resourceId: string,
    from: readonly PortalResourceStatus[],
    to: PortalResourceStatus,
  ): Promise<PortalResourceItem>;
  setFavorite(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    active: boolean,
  ): Promise<boolean>;
  listFavorites(
    actor: ActorContext,
    page: number,
    pageSize: number,
  ): Promise<PortalListResult>;
  listComments(
    type: PortalResourceType,
    resourceId: string,
  ): Promise<PortalCommentItem[]>;
  createComment(
    actor: ActorContext,
    type: PortalResourceType,
    resourceId: string,
    body: string,
    parentCommentId: string | null,
  ): Promise<PortalCommentItem>;
  listDashboardComments(
    actor: ActorContext,
    input: DashboardCommentQuery,
  ): Promise<{
    items: PortalCommentItem[];
    total: number;
    page: number;
    pageSize: number;
  }>;
}
