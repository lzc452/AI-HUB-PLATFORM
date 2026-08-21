import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
} from "@ai-hub/contracts";
import type {
  CatalogDeliveryAction,
  CatalogListResult,
  CatalogRepository,
  CatalogSearchInput,
  DeliveryResolveResult,
} from "./catalog.types.js";
import type { DeliveryChannel } from "../application/application.types.js";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";
import {
  CatalogVisibilityPolicy,
  type CatalogVisibilityPort,
} from "./catalog-visibility.policy.js";

/**
 * 轻量校验 web 交付入口 URL：非空、http(s) 协议、可被 URL 解析。
 * 完整白名单校验（协议/端口/主机名/DNS CIDR）在 configureDelivery 时已执行
 * （T11），resolve 时无策略上下文，此处仅拦截空值与历史非法数据，避免
 * 前端 window.open 打开空白页或执行非 http(s) 目标。
 */
function isUsableWebRedirectUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !/^https?:\/\//i.test(trimmed)) return false;
  try {
    const protocol = new URL(trimmed).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export class CatalogService {
  private readonly visibility: CatalogVisibilityPort;

  constructor(
    private readonly repository: CatalogRepository,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
    visibility?: CatalogVisibilityPort,
  ) {
    this.visibility = visibility ?? new CatalogVisibilityPolicy(repository);
  }

  async list(input: CatalogSearchInput): Promise<CatalogListResult> {
    return this.query(input);
  }

  async listCategories() {
    return this.repository.listCategories();
  }

  async listTags() {
    return this.repository.listTags();
  }

  async search(input: CatalogSearchInput): Promise<CatalogListResult> {
    return this.query(input);
  }

  async getDetail(actor: ActorContext, applicationId: string) {
    return this.visibility.requireVisible(actor, applicationId);
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

  async resolveDelivery(
    actor: ActorContext,
    applicationId: string,
    channel: DeliveryChannel,
  ): Promise<DeliveryResolveResult> {
    const entry = await this.getDetail(actor, applicationId);
    if (!entry.deliveryChannels.includes(channel)) {
      throw new Error("CATALOG_DELIVERY_CHANNEL_NOT_ENABLED");
    }
    const delivery = await this.repository.findDelivery(applicationId, channel);
    if (delivery === null || !delivery.enabled) {
      throw new Error("CATALOG_DELIVERY_CHANNEL_NOT_ENABLED");
    }

    const actionType: CatalogDeliveryAction =
      channel === "web"
        ? "web_redirect"
        : channel === "mini_program"
          ? "qr_display"
          : "package_download";

    const idempotencyKey = `action:${actor.sessionId}:${applicationId}:${channel}:${entry.currentVersionId}`;
    await this.repository.recordDeliveryAction({
      applicationId,
      applicationVersionId: entry.currentVersionId,
      actorEmployeeId: actor.employeeId,
      actionType,
      channel,
      idempotencyKey,
      status: "initiated",
    });

    if (actionType === "package_download") {
      await this.analyticsEvents?.record(actor, {
        eventName: "application_downloaded",
        aggregateType: "application",
        aggregateId: applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-downloaded:${actor.sessionId}:${applicationId}:${entry.currentVersionId}:${Date.now()}`,
        metadata: { channel },
        audience: { employeeId: actor.employeeId },
      });
    }

    if (channel === "web") {
      if (!isUsableWebRedirectUrl(delivery.entryUrl)) {
        throw new Error("WEB_DELIVERY_URL_MISSING");
      }
      return { kind: "web_redirect", url: delivery.entryUrl };
    }
    if (channel === "mini_program") {
      const qrAsset = await this.repository.findQrAssetForDelivery(
        delivery.deliveryId,
      );
      if (qrAsset !== null) {
        return {
          kind: "qr",
          assetUrl: `/internal/catalog/deliveries/${encodeURIComponent(delivery.deliveryId)}/qr`,
        };
      }
      // 无二维码资产时回退 entryUrl 文本（保持既有兼容行为）。
      return { kind: "qr", payload: delivery.entryUrl };
    }
    const storageKey = await this.repository.findDeliveryAssetStorageKey(
      applicationId,
      channel,
    );
    if (storageKey !== null) {
      return {
        kind: "download",
        url: `/internal/catalog/${encodeURIComponent(applicationId)}/deliveries/${channel}/asset`,
        fileName: null,
      };
    }
    if (isUsableWebRedirectUrl(delivery.entryUrl)) {
      return { kind: "web_redirect", url: delivery.entryUrl };
    }
    return { kind: "unavailable", reason: "该渠道暂未配置可下载安装包" };
  }

  async getScreenshotStorageKey(
    actor: ActorContext,
    applicationId: string,
    assetId: string,
  ): Promise<string> {
    await this.getDetail(actor, applicationId);
    const storageKey = await this.repository.findScreenshotAssetStorageKey(
      applicationId,
      assetId,
    );
    if (storageKey === null) {
      throw new Error("CATALOG_SCREENSHOT_NOT_FOUND");
    }
    return storageKey;
  }

  async getDeliveryAssetStorageKey(
    actor: ActorContext,
    applicationId: string,
    channel: DeliveryChannel,
  ): Promise<string> {
    const entry = await this.getDetail(actor, applicationId);
    if (!entry.deliveryChannels.includes(channel)) {
      throw new Error("CATALOG_DELIVERY_CHANNEL_NOT_ENABLED");
    }
    const storageKey = await this.repository.findDeliveryAssetStorageKey(
      applicationId,
      channel,
    );
    if (storageKey === null) {
      throw new Error("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    }
    return storageKey;
  }

  /** 按交付 ID 返回二维码资产的存储信息（含应用可见性校验）。 */
  async getQrAsset(
    actor: ActorContext,
    deliveryId: string,
  ): Promise<{ storageKey: string; mimeType: string }> {
    const applicationId =
      await this.repository.findApplicationIdForDelivery(deliveryId);
    if (applicationId === null) {
      throw new Error("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    }
    await this.getDetail(actor, applicationId);
    const asset = await this.repository.findQrAssetForDelivery(deliveryId);
    if (asset === null) {
      throw new Error("CATALOG_DELIVERY_ASSET_NOT_FOUND");
    }
    return asset;
  }

  async getRiskDescription(
    actor: ActorContext,
    applicationId: string,
  ): Promise<{ riskDescription: string }> {
    await this.getDetail(actor, applicationId);
    const description = await this.repository.getRiskDescription(applicationId);
    return {
      riskDescription:
        description !== null && description.trim().length > 0
          ? description
          : "该应用暂未提供风险说明。请根据实际业务需求评估使用风险，如有疑问请联系应用负责人。",
    };
  }

  async saveRiskDescription(
    actor: ActorContext,
    applicationId: string,
    description: string,
  ): Promise<void> {
    await this.getDetail(actor, applicationId);
    if (!description || description.trim().length === 0) {
      throw new Error("RISK_DESCRIPTION_REQUIRED");
    }
    // 风险说明编辑是治理操作：仅应用 owner/maintainer 或具备
    // APPLICATION_MANAGE 权限者可修改（与详情 capabilities.canEditRisk 对齐）。
    const ownership = await this.repository.findApplicationOwner(applicationId);
    if (
      ownership === null ||
      (ownership.ownerEmployeeId !== actor.employeeId &&
        ownership.maintainerEmployeeId !== actor.employeeId &&
        !hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE))
    ) {
      throw new Error("NOT_AUTHORIZED");
    }
    const trimmed = description.trim();
    await this.repository.upsertRiskDescription(applicationId, trimmed);
    await this.repository.recordAudit({
      applicationId,
      actorEmployeeId: actor.employeeId,
      eventType: "catalog.risk_updated",
      details: { riskDescription: trimmed },
    });
  }

  private async query(input: CatalogSearchInput): Promise<CatalogListResult> {
    if (input.page < 1 || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error("CATALOG_PAGINATION_INVALID");
    }
    if (this.repository.listVisiblePage !== undefined) {
      return this.repository.listVisiblePage(input);
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
