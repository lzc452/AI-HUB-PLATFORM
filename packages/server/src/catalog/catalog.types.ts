import type { ActorContext } from "@ai-hub/contracts";
import type { DeliveryChannel } from "../application/application.types.js";

export type CatalogSort = "recommended" | "latest" | "popular" | "rating";
export type TrustLabel =
  | "experimental"
  | "verified"
  | "recommended"
  | "deprecated";
export type CatalogHealthStatus = "unknown" | "healthy" | "degraded" | "failed";
export type CatalogDeliveryAction =
  | "web_redirect"
  | "package_download"
  | "qr_display";

export interface CatalogEntry {
  applicationId: string;
  name: string;
  summary: string;
  departmentId: string;
  categoryId: string;
  tagIds: readonly string[];
  trustLabels: readonly TrustLabel[];
  currentVersionId: string;
  publishedAt: Date;
  deliveryChannels: readonly DeliveryChannel[];
  likeCount: number;
  ratingAverage: number | null;
  ratingCount?: number;
  myRating: number | null;
  likedByMe: boolean;
  maintainers?: readonly string[];
  attachments?: readonly {
    name: string;
    type: "pdf" | "docx" | "doc" | "other";
    size: string;
  }[];
  capabilities?: {
    canResolveDelivery: boolean;
    canLike: boolean;
    canRate: boolean;
    canComment: boolean;
    canSubmitFeedback: boolean;
    canModerateComments: boolean;
    canEditRisk: boolean;
    canReplyOfficial?: boolean;
  };
  healthStatus: CatalogHealthStatus;
  deprecatedReason: string | null;
  replacementApplicationId: string | null;
}

export interface CatalogSearchInput {
  actor: ActorContext;
  query?: string;
  categoryId?: string;
  tagIds?: readonly string[];
  applicationType?: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}

export interface CatalogListResult {
  items: readonly CatalogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CategorySummary {
  categoryId: string;
  name: string;
}

export interface TagSummary {
  tagId: string;
  name: string;
}

export interface CatalogRepository {
  listVisible(input: CatalogSearchInput): Promise<readonly CatalogEntry[]>;
  listCategories(): Promise<readonly CategorySummary[]>;
  listTags(): Promise<readonly TagSummary[]>;
  listVisiblePage?(input: CatalogSearchInput): Promise<CatalogListResult>;
  findVisible(
    actor: ActorContext,
    applicationId: string,
  ): Promise<CatalogEntry | null>;
  /** 应用归属信息（与发布状态无关），用于 owner/maintainer 管理自身应用的可见性判定。 */
  findApplicationOwner(applicationId: string): Promise<{
    ownerEmployeeId: string;
    maintainerEmployeeId: string | null;
  } | null>;
  recordDeliveryAction(input: {
    applicationId: string;
    applicationVersionId: string;
    actorEmployeeId: string;
    actionType: CatalogDeliveryAction;
    channel?: string | null;
    idempotencyKey?: string | null;
    status?: "initiated" | "served" | "failed";
  }): Promise<void>;
  findDelivery(
    applicationId: string,
    channel: DeliveryChannel,
  ): Promise<{ deliveryId: string; entryUrl: string; enabled: boolean } | null>;
  findDeliveryAssetStorageKey(
    applicationId: string,
    channel: DeliveryChannel,
  ): Promise<string | null>;
  /** delivery_targets.qr_code_asset_id → application_assets 记录（含存储键与 mime）。 */
  findQrAssetForDelivery(
    deliveryId: string,
  ): Promise<{ storageKey: string; mimeType: string } | null>;
  /** 交付记录归属的应用（用于二维码端点先做应用可见性校验）。 */
  findApplicationIdForDelivery(deliveryId: string): Promise<string | null>;
  getRiskDescription(applicationId: string): Promise<string | null>;
  upsertRiskDescription(
    applicationId: string,
    description: string,
  ): Promise<void>;
  /** 写入应用审计事件（与交互/需求模块同表 application_audit_events）。 */
  recordAudit(input: {
    applicationId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
}

/** 交付解析结果：不同渠道返回不同的可执行目标。
 * qr：有二维码资产时返回 assetUrl（前端渲染 <img>）；无资产时回退
 * payload（entryUrl 文本，保持兼容）。 */
export type DeliveryResolveResult =
  | { kind: "web_redirect"; url: string }
  | { kind: "download"; url: string; fileName: string | null }
  | { kind: "qr"; assetUrl?: string; payload?: string }
  | { kind: "unavailable"; reason: string };
