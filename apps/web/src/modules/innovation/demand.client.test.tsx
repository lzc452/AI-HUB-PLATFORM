import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateDemandCollaboratorRole } from "./demand.client";

describe("需求协作者客户端", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ demandId: "d-1", employeeId: "e-2", role: "operator" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  it("用乐观锁 PATCH 协作者角色", async () => {
    await updateDemandCollaboratorRole("d-1", "e-2", {
      role: "operator",
      expectedVersion: 4,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/internal/demands/d-1/collaborators/e-2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "operator", expectedVersion: 4 }),
      }),
    );
  });
});
