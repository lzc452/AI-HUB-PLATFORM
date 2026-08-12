import type { DemandEntry } from "@ai-hub/contracts";

export type DemandView = DemandEntry & {
  requesterDepartmentId?: string | null;
  requesterDepartmentName?: string | null;
  requesterDisplayName?: string | null;
  ownerDisplayName?: string | null;
  ownerDepartmentName?: string | null;
  likedByCurrentActor?: boolean;
};

export type CommentView = {
  commentId: string;
  demandId: string;
  parentCommentId: string | null;
  authorEmployeeId: string | null;
  authorDisplayName?: string | null;
  authorDepartmentId?: string | null;
  authorDepartmentName?: string | null;
  body: string;
  displayAnonymously: boolean;
  likeCount: number;
  likedByCurrentActor: boolean;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
};
