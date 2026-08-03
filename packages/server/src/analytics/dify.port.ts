import type {
  DifyAssistantPort,
  DifyRequest,
  DifyResponse,
} from "./assistant.types.js";

export class UnavailableDifyAssistantPort implements DifyAssistantPort {
  async ask(input: DifyRequest): Promise<DifyResponse> {
    void input;
    throw new Error("DIFY_NOT_CONFIGURED");
  }
}
