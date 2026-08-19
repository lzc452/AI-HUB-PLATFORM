import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
} from "@ai-hub/contracts";
import type { CatalogEntry, CatalogRepository } from "./catalog.types.js";

/**
 * 市场资源的统一可见性边界。
 *
 * 所有通过 applicationId 直接访问市场资源的读写路径都必须经过该接口，
 * 避免详情页、交付、互动和反馈各自复制发布状态与受众判定。
 */
export interface CatalogVisibilityPort {
  /**
   * 公开访问门禁：应用必须已发布且可见，否则抛错。
   * 用于点赞、评分、评论、举报等面向公众的互动。
   */
  requireVisible(
    actor: ActorContext,
    applicationId: string,
  ): Promise<CatalogEntry>;

  /**
   * 管理访问门禁：已发布且可见时按公开访问控制；
   * 非发布态仅应用 owner/maintainer 或具备 APPLICATION_MANAGE 权限者可访问，
   * 用于 owner 管理自身应用的反馈与评论（即使应用尚未发布）。
   */
  requireVisibleOrManageable(
    actor: ActorContext,
    applicationId: string,
  ): Promise<void>;
}

export class CatalogVisibilityPolicy implements CatalogVisibilityPort {
  constructor(
    private readonly repository: Pick<
      CatalogRepository,
      "findVisible" | "findApplicationOwner"
    >,
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

  async requireVisibleOrManageable(
    actor: ActorContext,
    applicationId: string,
  ): Promise<void> {
    const entry = await this.repository.findVisible(actor, applicationId);
    if (entry !== null) {
      if (entry.currentVersionId.length === 0) {
        throw new Error("CATALOG_PUBLISHED_VERSION_REQUIRED");
      }
      return; // 已发布且可见：按公开访问控制
    }
    // 非发布态：仅应用 owner/maintainer 或具备 APPLICATION_MANAGE 权限者可访问，
    // 用于管理自身应用的反馈与评论，避免 owner 被发布态门禁误伤。
    const owner = await this.repository.findApplicationOwner(applicationId);
    if (owner === null) throw new Error("CATALOG_APPLICATION_NOT_FOUND");
    const manageable =
      owner.ownerEmployeeId === actor.employeeId ||
      owner.maintainerEmployeeId === actor.employeeId ||
      hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE);
    if (!manageable) throw new Error("CATALOG_APPLICATION_NOT_FOUND");
  }
}
