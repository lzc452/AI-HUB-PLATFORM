export type FeedbackType = "bug" | "suggestion" | "content_issue";
export type FeedbackStatus = "open" | "in_progress" | "resolved" | "closed";

export interface FeedbackRecord {
  feedbackId: string;
  applicationId: string;
  applicationVersionId: string | null;
  creatorEmployeeId: string;
  type: FeedbackType;
  body: string;
  status: FeedbackStatus;
  assigneeEmployeeId: string | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface FeedbackApplicationRecord {
  applicationId: string;
  ownerEmployeeId: string;
  maintainerEmployeeId: string;
}

export interface FeedbackRepository {
  withTransaction<T>(
    operation: (repository: FeedbackRepository) => Promise<T>,
  ): Promise<T>;
  findApplication(
    applicationId: string,
  ): Promise<FeedbackApplicationRecord | null>;
  createFeedback(
    input: Omit<
      FeedbackRecord,
      "feedbackId" | "createdAt" | "updatedAt" | "resolvedAt"
    >,
  ): Promise<FeedbackRecord>;
  listFeedbackByCreator(
    applicationId: string,
    creatorEmployeeId: string,
  ): Promise<readonly FeedbackRecord[]>;
  listByApplication(applicationId: string): Promise<readonly FeedbackRecord[]>;
  findFeedback(feedbackId: string): Promise<FeedbackRecord | null>;
  updateFeedback(
    feedbackId: string,
    input: Partial<
      Pick<
        FeedbackRecord,
        "status" | "assigneeEmployeeId" | "resolution" | "resolvedAt"
      >
    >,
  ): Promise<FeedbackRecord | null>;
  recordAudit(input: {
    applicationId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
  emitOutbox(input: {
    applicationId: string;
    eventType: string;
  }): Promise<void>;
}
