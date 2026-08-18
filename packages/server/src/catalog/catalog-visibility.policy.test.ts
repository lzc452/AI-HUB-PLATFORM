import { describe, expect, it } from "vitest";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import { CatalogVisibilityPolicy } from "./catalog-visibility.policy.js";
import type { CatalogEntry, CatalogRepository } from "./catalog.types.js";

const owner: ActorContext = {
  employeeId: "E100",
  roleCodes: ["employee"],
  departmentIds: ["dept-platform"],
  primaryDepartmentId: "dept-platform",
  sessionId: "session-owner",
};
const maintainer: ActorContext = {
  ...owner,
  employeeId: "E101",
  sessionId: "session-maintainer",
};
const employee: ActorContext = {
  ...owner,
  employeeId: "E200",
  sessionId: "session-employee",
};
const admin: ActorContext = {
  ...owner,
  employeeId: "E300",
  roleCodes: ["application_admin"],
  permissions: [PERMISSIONS.APPLICATION_MANAGE],
  sessionId: "session-admin",
};

function publishedEntry(): CatalogEntry {
  return {
    applicationId: "app-1",
    name: "平台助手",
    summary: "平台流程自动化",
    departmentId: "dept-platform",
    categoryId: "cat-productivity",
    tagIds: [],
    trustLabels: ["verified"],
    currentVersionId: "version-1",
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    deliveryChannels: ["web"],
    likeCount: 0,
    ratingAverage: null,
    myRating: null,
    likedByMe: false,
    healthStatus: "healthy",
    deprecatedReason: null,
    replacementApplicationId: null,
  };
}

function makeRepository(opts: {
  visible: CatalogEntry | null;
  owner?: {
    ownerEmployeeId: string;
    maintainerEmployeeId: string | null;
  } | null;
}): Pick<CatalogRepository, "findVisible" | "findApplicationOwner"> {
  return {
    findVisible: async () => opts.visible,
    findApplicationOwner: async () => opts.owner ?? null,
  };
}

describe("CatalogVisibilityPolicy.requireVisibleOrManageable", () => {
  it("allows any actor to access a published and visible application", async () => {
    const policy = new CatalogVisibilityPolicy(
      makeRepository({ visible: publishedEntry() }),
    );
    await expect(
      policy.requireVisibleOrManageable(employee, "app-1"),
    ).resolves.toBeUndefined();
  });

  it("allows the owner to access an owned non-published application", async () => {
    const policy = new CatalogVisibilityPolicy(
      makeRepository({
        visible: null,
        owner: { ownerEmployeeId: "E100", maintainerEmployeeId: null },
      }),
    );
    await expect(
      policy.requireVisibleOrManageable(owner, "app-1"),
    ).resolves.toBeUndefined();
  });

  it("allows the maintainer to access an owned non-published application", async () => {
    const policy = new CatalogVisibilityPolicy(
      makeRepository({
        visible: null,
        owner: { ownerEmployeeId: "E100", maintainerEmployeeId: "E101" },
      }),
    );
    await expect(
      policy.requireVisibleOrManageable(maintainer, "app-1"),
    ).resolves.toBeUndefined();
  });

  it("allows an application manager to access a non-published application", async () => {
    const policy = new CatalogVisibilityPolicy(
      makeRepository({
        visible: null,
        owner: { ownerEmployeeId: "E100", maintainerEmployeeId: null },
      }),
    );
    await expect(
      policy.requireVisibleOrManageable(admin, "app-1"),
    ).resolves.toBeUndefined();
  });

  it("blocks a non-owner employee from a non-published application", async () => {
    const policy = new CatalogVisibilityPolicy(
      makeRepository({
        visible: null,
        owner: { ownerEmployeeId: "E100", maintainerEmployeeId: null },
      }),
    );
    await expect(
      policy.requireVisibleOrManageable(employee, "app-1"),
    ).rejects.toThrow("CATALOG_APPLICATION_NOT_FOUND");
  });

  it("blocks access when the application does not exist", async () => {
    const policy = new CatalogVisibilityPolicy(
      makeRepository({ visible: null, owner: null }),
    );
    await expect(
      policy.requireVisibleOrManageable(owner, "app-1"),
    ).rejects.toThrow("CATALOG_APPLICATION_NOT_FOUND");
  });
});
