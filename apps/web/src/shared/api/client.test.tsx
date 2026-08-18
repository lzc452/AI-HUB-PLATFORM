import { beforeEach, describe, expect, it, vi } from "vitest";

import { setSession } from "../../modules/auth/session.store";
import { ApiError, apiFetch, apiUpload } from "./client";

class XMLHttpRequestStub {
  readonly headers = new Headers();
  readonly upload = {
    onprogress: null as ((event: ProgressEvent) => void) | null,
  };
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
    setSession({ employeeId: "E-SECURE" });
    document.cookie = "csrf_token=csrf-value; Path=/";
  });

  it("为 JSON 写请求附加 CSRF 与一次性 replay 头", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(init?.credentials).toBe("same-origin");
        expect(headers.get("x-employee-id")).toBeNull();
        expect(headers.get("x-session-id")).toBeNull();
        expect(headers.get("x-csrf-token")).toBe("csrf-value");
        expect(headers.get("x-request-nonce")).toMatch(
          /^[A-Za-z0-9._~-]{16,128}$/u,
        );
        expect(
          Number.isNaN(Date.parse(headers.get("x-request-timestamp") ?? "")),
        ).toBe(false);
        return Response.json({ updated: true });
      },
    );
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

describe("API 错误响应解析", () => {
  it("从 400 校验失败响应解析问题清单", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "DRAFT_VALIDATION_FAILED",
            detail: "草稿未通过提交校验",
            issues: [
              {
                code: "DELIVERY_TARGETS_INCOMPLETE",
                message: "交付目标不完整",
              },
              { code: "MANUAL_HTML_REQUIRED", message: "手册内容为空" },
            ],
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      apiFetch("/internal/applications/app-1/submit-draft", {
        method: "POST",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "DRAFT_VALIDATION_FAILED",
      detail: "草稿未通过提交校验",
      issues: [
        { code: "DELIVERY_TARGETS_INCOMPLETE", message: "交付目标不完整" },
        { code: "MANUAL_HTML_REQUIRED", message: "手册内容为空" },
      ],
    });
  });

  it("非 JSON 错误响应回退为 UNKNOWN 且无问题清单", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gateway timeout", { status: 502 })),
    );

    const error = await apiFetch("/internal/applications/app-1").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "UNKNOWN" });
    expect((error as ApiError).issues).toBeUndefined();
  });
});
