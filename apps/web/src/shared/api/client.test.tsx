import { beforeEach, describe, expect, it, vi } from "vitest";

import { setSession } from "../../modules/auth/session.store";
import { apiFetch, apiUpload } from "./client";

class XMLHttpRequestStub {
  readonly headers = new Headers();
  readonly upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  status = 200;
  responseText = JSON.stringify({ uploaded: true });
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open() {}

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send() {
    this.onload?.();
  }
}

describe("API 安全请求头", () => {
  beforeEach(() => {
    setSession({ employeeId: "E-SECURE", sessionId: "session-secure" });
    document.cookie = "csrf_token=csrf-value; Path=/";
  });

  it("为 JSON 写请求附加 CSRF 与一次性 replay 头", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(init?.credentials).toBe("same-origin");
      expect(headers.get("x-employee-id")).toBe("E-SECURE");
      expect(headers.get("x-session-id")).toBe("session-secure");
      expect(headers.get("x-csrf-token")).toBe("csrf-value");
      expect(headers.get("x-request-nonce")).toMatch(/^[A-Za-z0-9._~-]{16,128}$/u);
      expect(
        Number.isNaN(Date.parse(headers.get("x-request-timestamp") ?? "")),
      ).toBe(false);
      return Response.json({ updated: true });
    });
    vi.stubGlobal("fetch", request);

    await expect(
      apiFetch<{ updated: boolean }>("/internal/probe", {
        method: "PATCH",
        body: JSON.stringify({ value: 1 }),
      }),
    ).resolves.toEqual({ updated: true });
  });

  it("为 XHR 上传附加同一套生产安全头", async () => {
    const request = new XMLHttpRequestStub();
    vi.stubGlobal(
      "XMLHttpRequest",
      vi.fn(() => request),
    );

    await expect(
      apiUpload<{ uploaded: boolean }>(
        "/internal/applications/app-1/artifact",
        new Blob(["artifact"]),
      ),
    ).resolves.toEqual({ uploaded: true });

    expect(request.headers.get("x-csrf-token")).toBe("csrf-value");
    expect(request.headers.get("x-request-nonce")).toMatch(
      /^[A-Za-z0-9._~-]{16,128}$/u,
    );
    expect(
      Number.isNaN(
        Date.parse(request.headers.get("x-request-timestamp") ?? ""),
      ),
    ).toBe(false);
  });
});
