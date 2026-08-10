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

export interface RatingOutput {
  ratingId: string;
  applicationId: string;
  applicationVersionId: string;
  employeeId: string;
  stars: number;
  body: string | null;
  displayAnonymously: boolean;
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
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: readonly T[];
  total: number;
}
