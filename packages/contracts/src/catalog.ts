import type { DeliveryChannel } from "./application.js";

export type CatalogSort = "recommended" | "latest" | "popular";
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

export interface RiskDescription {
  riskDescription: string;
}

export interface SaveRiskDescriptionInput {
  riskDescription: string;
}
