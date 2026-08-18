import { afterEach, describe, expect, it, vi } from "vitest";

// 拦截 SSRF 防护，避免测试中发起真实 DNS 解析。
const assertPublicHttpTargetMock = vi.fn(async (rawUrl: string) => {
  if (rawUrl.includes("api.dingtalk.com")) {
    return new URL(rawUrl);
  }
  throw new Error("SSRF_PRIVATE_TARGET");
});

vi.mock("../system/security/ssrf-policy.js", () => ({
  assertPublicHttpTarget: (rawUrl: string) => assertPublicHttpTargetMock(rawUrl),
}));

import { DingTalkApiClient } from "./dingtalk-api.client.js";

const DINGTALK_TOKEN_URL =
  "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
const DINGTALK_USERINFO_URL = "https://api.dingtalk.com/v1.0/contact/users/me";

function mockFetchOnce(body: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status }) as unknown as Response,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  assertPublicHttpTargetMock.mockClear();
});

describe("DingTalkApiClient - 中危-4 SSRF 防护接入", () => {
  it("exchangeCodeForToken 在发起请求前校验目标为公开地址", async () => {
    const client = new DingTalkApiClient("client-id", "client-secret");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ accessToken: "tok", expireIn: 7200 }), {
          status: 200,
        }) as unknown as Response,
      );

    await client.exchangeCodeForToken("auth-code");

    expect(assertPublicHttpTargetMock).toHaveBeenCalledWith(DINGTALK_TOKEN_URL);
    expect(fetchSpy).toHaveBeenCalledWith(
      DINGTALK_TOKEN_URL,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("getUserInfo 同样校验目标为公开地址", async () => {
    const client = new DingTalkApiClient("client-id", "client-secret");
    mockFetchOnce({ openId: "open-id-1", jobNumber: "E001" });

    await client.getUserInfo("access-token");

    expect(assertPublicHttpTargetMock).toHaveBeenCalledWith(DINGTALK_USERINFO_URL);
  });

  it("SSRF 校验拒绝时，出站调用失败而非访问私有目标", async () => {
    assertPublicHttpTargetMock.mockImplementationOnce(async () => {
      throw new Error("SSRF_PRIVATE_TARGET");
    });
    const client = new DingTalkApiClient("client-id", "client-secret");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(client.exchangeCodeForToken("auth-code")).rejects.toThrow(
      "SSRF_PRIVATE_TARGET",
    );
    // 绝不能向私有目标发起真实请求。
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("合法响应按原有契约解析", async () => {
    const client = new DingTalkApiClient("client-id", "client-secret");
    mockFetchOnce({ accessToken: "tok", expireIn: 7200, refreshToken: "r" });

    const token = await client.exchangeCodeForToken("auth-code");
    expect(token).toEqual({ accessToken: "tok", expiresIn: 7200, refreshToken: "r" });
  });
});
