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
