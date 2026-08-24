import { describe, expect, it } from "vitest";
import type { DatabaseSchema } from "./schema.js";

describe("Portal 数据库 Schema", () => {
  it("包含一期所有 Portal 表类型", () => {
    const tables: ReadonlyArray<keyof DatabaseSchema> = [
      "portal_skills",
      "portal_skill_versions",
      "portal_skill_files",
      "portal_plugins",
      "portal_plugin_versions",
      "portal_mcps",
      "portal_mcp_versions",
      "portal_skill_packages",
      "portal_skill_package_items",
      "portal_app_hunt_periods",
      "portal_app_hunt_entries",
      "portal_app_hunt_votes",
      "portal_department_profiles",
      "portal_favorites",
      "portal_resource_comments",
      "portal_content_pages",
      "portal_curations",
    ];
    expect(tables).toHaveLength(17);
    expect(new Set(tables).size).toBe(tables.length);
  });
});
