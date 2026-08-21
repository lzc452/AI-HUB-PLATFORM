import type { DeliveryChannel } from "./application.js";

export type CatalogSort = "recommended" | "latest" | "popular" | "rating";
export type TrustLabel =
  | "experimental"
  | "verified"
  | "recommended"
  | "deprecated";
export type CatalogHealthStatus = "unknown" | "healthy" | "degraded" | "failed";

export interface CatalogQuery {
  query?: string;
  categoryId?: string;
  tagIds?: readonly string[];
  applicationType?: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}

export interface CatalogEntry {
  applicationId: string;
  name: string;
  summary: string;
  departmentId: string;
  categoryId: string;
  tagIds: readonly string[];
  trustLabels: readonly TrustLabel[];
  currentVersionId: string;
  publishedAt: string;
  deliveryChannels: readonly DeliveryChannel[];
  likeCount: number;
  ratingAverage: number | null;
  ratingCount?: number;
  /** 当前用户（actor）的评分（1-5）；未评分时为 null。 */
  myRating: number | null;
  /** 当前用户（actor）是否已点赞。 */
  likedByMe: boolean;
  maintainers?: readonly string[];
  attachments?: readonly {
    assetId: string;
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
    /** 当前用户可否回复评论（所有有互动权限的员工）。 */
    canReply?: boolean;
  };
  healthStatus: CatalogHealthStatus;
  deprecatedReason: string | null;
  replacementApplicationId: string | null;
}

export interface RiskDescription {
  riskDescription: string;
}

export interface SaveRiskDescriptionInput {
  riskDescription: string;
}
