export interface RatingInput {
  stars: number;
  body?: string;
  displayAnonymously?: boolean;
}

export interface CommentInput {
  parentCommentId: string | null;
  body: string;
  displayAnonymously?: boolean;
}

export type ReportStatus = "open" | "dismissed" | "hidden" | "restored";

/** 员工账号状态（disabled/archived 视为已停用）。 */
export type EmployeeStatus =
  | "pending_binding"
  | "active"
  | "disabled"
  | "archived";

export interface RatingOutput {
  ratingId: string;
  applicationId: string;
  applicationVersionId: string;
  employeeId: string;
  stars: number;
  body: string | null;
  displayAnonymously: boolean;
  /** 评分员工账号状态；员工行缺失时为 null。 */
  authorStatus: EmployeeStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentOutput {
  commentId: string;
  applicationId: string;
  applicationVersionId: string;
  parentCommentId: string | null;
  authorEmployeeId: string;
  body: string;
  displayAnonymously: boolean;
  /** 评论作者账号状态；员工行缺失时为 null。 */
  authorStatus: EmployeeStatus | null;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: readonly T[];
  total: number;
}
