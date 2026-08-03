import type { ActorContext } from "@ai-hub/contracts";

export interface AssistantAuthorizationReview {
  allowed: boolean;
  reason: string;
}

export interface AssistantRequest {
  question: string;
  context: Readonly<Record<string, unknown>>;
}

export interface DifyRequest {
  question: string;
  context: Readonly<Record<string, string | number | boolean>>;
}

export interface DifyResponse {
  answer: string;
  providerRequestId?: string;
}

export interface DifyAssistantPort {
  ask(input: DifyRequest): Promise<DifyResponse>;
}

export interface AssistantAuditRecord {
  actorEmployeeId: string;
  action: string;
  details: unknown;
}

export interface AssistantAuditRepository {
  reviewAuthorization(
    actor: ActorContext,
    request: AssistantRequest,
  ): Promise<AssistantAuthorizationReview>;
  recordAudit(input: AssistantAuditRecord): Promise<void>;
}

export interface AssistantResult {
  status: "ok" | "degraded";
  answer: string;
}
