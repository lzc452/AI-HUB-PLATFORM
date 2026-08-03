import type { ActorContext } from "@ai-hub/contracts";
import type {
  CatalogDeliveryAction,
  CatalogListResult,
  CatalogRepository,
  CatalogSearchInput,
} from "./catalog.types.js";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
  ) {}

  async list(input: CatalogSearchInput): Promise<CatalogListResult> {
    return this.query(input);
  }

  async search(input: CatalogSearchInput): Promise<CatalogListResult> {
    return this.query(input);
  }

  async getDetail(actor: ActorContext, applicationId: string) {
    const entry = await this.repository.findVisible(actor, applicationId);
    if (entry === null) throw new Error("CATALOG_APPLICATION_NOT_FOUND");
    if (entry.currentVersionId.length === 0) {
      throw new Error("CATALOG_PUBLISHED_VERSION_REQUIRED");
    }
    return entry;
  }

  async recordDeliveryAction(
    actor: ActorContext,
    input: {
      applicationId: string;
      actionType: CatalogDeliveryAction;
      channel?: string | null;
    },
  ): Promise<void> {
    if (
      !["web_redirect", "package_download", "qr_display"].includes(
        input.actionType,
      )
    ) {
      throw new Error("CATALOG_DELIVERY_ACTION_INVALID");
    }
    const entry = await this.getDetail(actor, input.applicationId);
    if (
      input.channel !== undefined &&
      input.channel !== null &&
      !entry.deliveryChannels.includes(
        input.channel as (typeof entry.deliveryChannels)[number],
      )
    ) {
      throw new Error("CATALOG_DELIVERY_CHANNEL_NOT_ENABLED");
    }
    await this.repository.recordDeliveryAction({
      applicationId: input.applicationId,
      applicationVersionId: entry.currentVersionId,
      actorEmployeeId: actor.employeeId,
      actionType: input.actionType,
      channel: input.channel ?? null,
    });
    if (input.actionType === "package_download") {
      await this.analyticsEvents?.record(actor, {
        eventName: "application_downloaded",
        aggregateType: "application",
        aggregateId: input.applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-downloaded:${actor.sessionId}:${input.applicationId}:${entry.currentVersionId}:${Date.now()}`,
        metadata: { channel: input.channel ?? "unknown" },
        audience: { employeeId: actor.employeeId },
      });
    }
  }

  private async query(input: CatalogSearchInput): Promise<CatalogListResult> {
    if (input.page < 1 || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error("CATALOG_PAGINATION_INVALID");
    }
    const visible = await this.repository.listVisible(input);
    const start = (input.page - 1) * input.pageSize;
    return {
      items: visible.slice(start, start + input.pageSize),
      total: visible.length,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
