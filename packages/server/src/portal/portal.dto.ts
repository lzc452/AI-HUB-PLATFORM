import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Length, MaxLength } from "class-validator";
import type { PortalResourceStatus } from "@ai-hub/database";
import type { DashboardCommentQuery, PortalListInput, PortalNativeResourceType, PortalResourceType } from "./portal.types.js";

export class PortalListQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsIn(["draft", "in_review", "approved", "published", "withdrawn", "archived"])
  status?: PortalResourceStatus;

  @IsOptional()
  @IsIn(["score", "latest", "name"])
  sortBy?: "score" | "latest" | "name";

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreatePortalDraftDto {
  @IsIn(["app", "skill", "plugin", "mcp"])
  resourceType!: PortalResourceType;

  @IsString()
  @Length(1, 120)
  slug!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsString()
  @Length(2, 2000)
  summary!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdatePortalDraftDto {
  @IsString()
  @Length(1, 120)
  slug!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsString()
  @Length(2, 2000)
  summary!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreatePortalVersionDto {
  @IsString()
  @Length(1, 64)
  version!: string;

  @IsString()
  @MaxLength(8000)
  changelog!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class FavoriteRequestDto {
  @IsBoolean()
  active!: boolean;
}

export class CommentRequestDto {
  @IsString()
  @Length(1, 4000)
  body!: string;

  @IsOptional()
  @IsString()
  parentCommentId?: string | null;
}

export class HuntVoteRequestDto {
  @IsString()
  periodId!: string;

  @IsString()
  entryId!: string;
}

export class DashboardCommentsQueryDto {
  @IsOptional()
  @IsIn(["replies", "mine"])
  view?: "replies" | "mine";

  @IsOptional()
  @IsIn(["app", "skill", "plugin", "mcp"])
  resourceType?: PortalResourceType;

  @IsOptional()
  @IsIn(["latest", "oldest"])
  sort?: "latest" | "oldest";

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export function toPortalListInput(query: PortalListQueryDto): PortalListInput {
  return {
    ...(query.query === undefined ? {} : { query: query.query }),
    ...(query.ownerEmployeeId === undefined ? {} : { ownerEmployeeId: query.ownerEmployeeId }),
    ...(query.status === undefined ? {} : { status: query.status }),
    sortBy: query.sortBy ?? "score",
    page: positiveInteger(query.page, 1),
    pageSize: Math.min(positiveInteger(query.pageSize, 20), 100),
  };
}

export function toDashboardCommentQuery(query: DashboardCommentsQueryDto): DashboardCommentQuery {
  return {
    view: query.view ?? "replies",
    ...(query.resourceType === undefined ? {} : { resourceType: query.resourceType }),
    sort: query.sort ?? "latest",
    page: positiveInteger(query.page, 1),
    pageSize: Math.min(positiveInteger(query.pageSize, 20), 100),
  };
}

export function parseResourceType(value: string): PortalResourceType {
  if (value === "app" || value === "skill" || value === "plugin" || value === "mcp") return value;
  throw new Error("PORTAL_RESOURCE_TYPE_INVALID");
}

export function parseNativeResourceType(value: string): PortalNativeResourceType {
  const type = parseResourceType(value);
  if (type === "app") throw new Error("PORTAL_NATIVE_RESOURCE_TYPE_REQUIRED");
  return type;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
