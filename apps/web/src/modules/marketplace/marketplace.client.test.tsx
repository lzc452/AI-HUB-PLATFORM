import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSession } from "../auth";
import {
  downloadDeliveryAsset,
  saveRiskDescription,
} from "./marketplace.client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadDeliveryAsset", () => {
  beforeEach(() => {
    setSession({ employeeId: "E-DOWNLOAD" });
  });

  it("使用当前登录会话下载交付制品", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-employee-id")).toBeNull();
        expect(headers.get("x-session-id")).toBeNull();
        return new Response("artifact-content", {
          headers: {
            "content-disposition": 'attachment; filename="desktop.zip"',
          },
        });
      },
    );
    vi.stubGlobal("fetch", request);

    const result = await downloadDeliveryAsset("app-delivery", "desktop");

    expect(request).toHaveBeenCalledOnce();
    expect(result.fileName).toBe("desktop.zip");
    expect(result.blob.size).toBeGreaterThan(0);
  });
});

describe("saveRiskDescription", () => {
  beforeEach(() => {
    setSession({ employeeId: "E-RISK" });
  });

  it("PUT { riskDescription } 到 /internal/catalog/:applicationId/risk", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({
          riskDescription: "新的风险说明",
        });
        return new Response(
          JSON.stringify({ riskDescription: "新的风险说明" }),
          { headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", request);

    const result = await saveRiskDescription("app-risk", "新的风险说明");

    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]![0])).toBe(
      "/internal/catalog/app-risk/risk",
    );
    expect(result).toEqual({ riskDescription: "新的风险说明" });
  });
});
