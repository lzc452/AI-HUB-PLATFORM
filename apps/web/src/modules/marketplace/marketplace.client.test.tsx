import { beforeEach, describe, expect, it, vi } from "vitest";

import { setSession } from "../auth/session.store";
import { downloadDeliveryAsset } from "./marketplace.client";

describe("downloadDeliveryAsset", () => {
  beforeEach(() => {
    setSession({ employeeId: "E-DOWNLOAD", sessionId: "session-download" });
  });

  it("使用当前登录会话下载交付制品", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-employee-id")).toBe("E-DOWNLOAD");
      expect(headers.get("x-session-id")).toBe("session-download");
      return new Response("artifact-content", {
        headers: {
          "content-disposition": 'attachment; filename="desktop.zip"',
        },
      });
    });
    vi.stubGlobal("fetch", request);

    const result = await downloadDeliveryAsset("app-delivery", "desktop");

    expect(request).toHaveBeenCalledOnce();
    expect(result.fileName).toBe("desktop.zip");
    expect(result.blob.size).toBeGreaterThan(0);
  });
});
