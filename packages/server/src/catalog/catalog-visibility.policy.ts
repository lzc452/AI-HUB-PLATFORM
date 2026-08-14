import type { ActorContext } from "@ai-hub/contracts";
import type { CatalogEntry, CatalogRepository } from "./catalog.types.js";

/**
 * 市场资源的统一可见性边界。
 *
 * 所有通过 applicationId 直接访问市场资源的读写路径都必须经过该接口，
 * 避免详情页、交付、互动和反馈各自复制发布状态与受众判定。
 */
export interface CatalogVisibilityPort {
  requireVisible(
    actor: ActorContext,
    applicationId: string,
  ): Promise<CatalogEntry>;
}

export class CatalogVisibilityPolicy implements CatalogVisibilityPort {
  constructor(
    private readonly repository: Pick<CatalogRepository, "findVisible">,
  ) {}

  async requireVisible(
    actor: ActorContext,
    applicationId: string,
  ): Promise<CatalogEntry> {
    const entry = await this.repository.findVisible(actor, applicationId);
    if (entry === null) throw new Error("CATALOG_APPLICATION_NOT_FOUND");
    if (entry.currentVersionId.length === 0) {
      throw new Error("CATALOG_PUBLISHED_VERSION_REQUIRED");
    }
    return entry;
  }
}
