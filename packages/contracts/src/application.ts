export type ApplicationId = string;
export type ApplicationVersionId = string;

export type DeliveryChannel = "web" | "desktop" | "mobile" | "mini_program";
export type ApplicationStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "withdrawn"
  | "archived";
export type ApplicationVersionScanStatus = "pending" | "passed" | "failed";
export type ReviewDecision = "approve" | "reject" | "request_changes";
export type ReviewQueueStatus = "available" | "claimed";

export interface ApplicationVersionInput {
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string;
  scanStatus: "passed";
}

export interface DeliveryConfig {
  channel: DeliveryChannel;
  entryUrl: string;
  minClientVersion?: string;
  enabled: boolean;
}

export interface ApplicationOwnershipInput {
  maintainerEmployeeId: string;
  departmentId: string;
}

export interface ApplicationVersion {
  applicationVersionId: string;
  applicationId: string;
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string;
  scanStatus: ApplicationVersionScanStatus;
  createdByEmployeeId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 创建应用分步表单 / 草稿（整表单一份 draft）
// ---------------------------------------------------------------------------

export type AiRiskModelProvider =
  | "deepseek"
  | "qwen"
  | "wenxin"
  | "hunyuan"
  | "local"
  | "other";

/** AI 与数据风险声明（6 项，1/2/3/5 为是/否，4 为枚举，6 为免责声明文本）。 */
export interface AiRiskDeclaration {
  handlesSensitiveData: boolean;
  sendsDataExternally: boolean;
  retainsConversations: boolean;
  retentionPeriod: string | null;
  modelProviders: AiRiskModelProvider[];
  providerNote: string | null;
  affectsHighRiskDecisions: boolean;
  inputRestrictionDisclaimer: string;
}

export type UploadKind =
  | "icon"
  | "screenshot"
  | "cover"
  | "attachment"
  | "qr"
  | "artifact";

export type IconMode = "auto" | "upload";
export type ApplicationType =
  | "web_app"
  | "desktop_app"
  | "mobile_app"
  | "mini_program";

export interface ApplicationIcon {
  mode: IconMode;
  backgroundColor: string | null;
  text: string | null;
  assetId: string | null;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface AudienceRule {
  audienceType: "all" | "department" | "employee";
  departmentId: string | null;
  employeeId: string | null;
  includeChildren: boolean;
}

export interface DeliveryDraftItem {
  channel: DeliveryChannel;
  entryUrl: string | null;
  minClientVersion: string | null;
  enabled: boolean;
  assetIds: string[];
}

/** 创建应用的草稿内容（不含责任人，责任人默认当前用户）。 */
export interface ApplicationDraft {
  name: string;
  departmentId: string;
  maintainerEmployeeIds: string[];
  categoryId: string;
  applicationType: ApplicationType;
  tagIds: string[];
  icon: ApplicationIcon;
  screenshotAssetIds: string[];
  summaryHtml: string;
  manualHtml: string | null;
  manualAssetId: string | null;
  examplesHtml: string | null;
  examplesAssetId: string | null;
  faq: FaqEntry[];
  audience: AudienceRule[];
  risk: AiRiskDeclaration;
  deliveries: DeliveryDraftItem[];
  version: string;
  changelog: string;
}

/** 草稿回显（含应用身份与状态）。 */
export interface ApplicationDraftRecord {
  applicationId: string;
  status: ApplicationStatus;
  ownerEmployeeId: string;
  draft: ApplicationDraft;
  updatedAt: string;
}

export interface ApplicationAdminKpis {
  deliveryFailed: number;
  pendingReview: number;
  published: number;
  total: number;
}
