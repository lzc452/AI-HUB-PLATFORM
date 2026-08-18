export const AUDIT_EVENT_CATALOG = {
  "identity.login": { module: "identity", risk: "low" },
  "identity.logout": { module: "identity", risk: "low" },
  "application.created": { module: "application", risk: "low" },
  "application.artifact.verification.requested": {
    module: "application",
    risk: "medium",
  },
  "application.artifact.verification.completed": {
    module: "application",
    risk: "low",
  },
  "application.artifact.verification.failed": {
    module: "application",
    risk: "high",
  },
  "application.review.claimed": { module: "review", risk: "medium" },
  "application.review.decided": { module: "review", risk: "high" },
  "application.published": { module: "application", risk: "high" },
  "application.withdrawn": { module: "application", risk: "high" },
  "application.withdraw.requested": { module: "application", risk: "low" },
  "catalog.delivery.resolved": { module: "catalog", risk: "low" },
  "catalog.comment.moderated": { module: "catalog", risk: "medium" },
  "feedback.created": { module: "feedback", risk: "low" },
  "feedback.status.changed": { module: "feedback", risk: "medium" },
  "organization.employee.changed": { module: "organization", risk: "high" },
  "organization.sync.completed": { module: "organization", risk: "medium" },
  "analytics.export.requested": { module: "analytics", risk: "medium" },
  "security.audit.export.requested": { module: "security", risk: "high" },
} as const;

export type AuditEventType = keyof typeof AUDIT_EVENT_CATALOG;
