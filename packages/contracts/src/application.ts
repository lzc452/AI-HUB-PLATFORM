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
