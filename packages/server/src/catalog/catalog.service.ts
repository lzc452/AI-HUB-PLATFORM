import type { ActorContext } from "@ai-hub/contracts";
import type {
  CatalogListResult,
  CatalogRepository,
  CatalogSearchInput,
} from "./catalog.types.js";

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async list(input: CatalogSearchInput): Promise<CatalogListResult> {
    return this.query(input);
  }

  async search(input: CatalogSearchInput): Promise<CatalogListResult> {
    return this.query(input);
  }

  async getDetail(actor: ActorContext, applicationId: string) {
    const entry = await this.repository.findVisible(actor, applicationId);
    if (entry === null) throw new Error("CATALOG_APPLICATION_NOT_FOUND");
    return entry;
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
