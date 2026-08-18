import { describe, expect, it } from "vitest";
import {
  validateWebTargetUrl,
  type ResolveHost,
  type WebTargetPolicy,
} from "./web-url-policy.js";

const policy: WebTargetPolicy = {
  protocols: ["https"],
  allowedHostnames: ["apps.internal.example.com", ".corp.example.com"],
  allowedPorts: [443, 8443],
  allowedCidrs: ["10.0.0.0/8", "172.16.0.0/12"],
};

/** 确定性的解析桩：不依赖真实 DNS（apps.internal.example.com 在公网不存在）。 */
const resolveInternal: ResolveHost = async () => [
  { address: "10.20.30.40", family: 4 },
];

describe("validateWebTargetUrl", () => {
  it("accepts a whitelisted https host", async () => {
    const url = await validateWebTargetUrl(
      "https://apps.internal.example.com:8443/dashboard",
      policy,
      resolveInternal,
    );
    expect(url.hostname).toBe("apps.internal.example.com");
  });

  it("accepts a wildcard-suffixed host from the allowlist", async () => {
    const url = await validateWebTargetUrl(
      "https://billing.corp.example.com/",
      policy,
      resolveInternal,
    );
    expect(url.hostname).toBe("billing.corp.example.com");
  });

  it("rejects unknown hosts and ports", async () => {
    await expect(
      validateWebTargetUrl("http://evil.example.net", policy, resolveInternal),
    ).rejects.toThrow("WEB_URL_PROTOCOL_NOT_ALLOWED");
    await expect(
      validateWebTargetUrl(
        "https://apps.internal.example.com:8080/",
        policy,
        resolveInternal,
      ),
    ).rejects.toThrow("WEB_URL_PORT_NOT_ALLOWED");
    await expect(
      validateWebTargetUrl(
        "https://evil.example.net/",
        policy,
        resolveInternal,
      ),
    ).rejects.toThrow("WEB_URL_HOST_NOT_ALLOWED");
  });

  it("rejects DNS resolution to non-allowlisted CIDRs", async () => {
    const resolveHost: ResolveHost = async () => [
      { address: "203.0.113.9", family: 4 },
    ];
    await expect(
      validateWebTargetUrl(
        "https://apps.internal.example.com/",
        policy,
        resolveHost,
      ),
    ).rejects.toThrow("WEB_URL_CIDR_NOT_ALLOWED");
  });

  it("rejects when any resolved address escapes the allowlist", async () => {
    // every() 语义：任一解析地址不在允许网段内即拒绝（防 DNS 重绑定）。
    const resolveHost: ResolveHost = async () => [
      { address: "10.9.9.9", family: 4 },
      { address: "203.0.113.9", family: 4 },
    ];
    await expect(
      validateWebTargetUrl(
        "https://apps.internal.example.com/",
        policy,
        resolveHost,
      ),
    ).rejects.toThrow("WEB_URL_CIDR_NOT_ALLOWED");
  });

  it("rejects a DNS failure", async () => {
    const resolveHost: ResolveHost = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(
      validateWebTargetUrl(
        "https://apps.internal.example.com/",
        policy,
        resolveHost,
      ),
    ).rejects.toThrow("WEB_URL_DNS_FAILED");
  });

  it("rejects IPv6-resolved targets (CIDR allowlist is IPv4-only)", async () => {
    const resolveHost: ResolveHost = async () => [
      { address: "::1", family: 6 },
    ];
    await expect(
      validateWebTargetUrl(
        "https://apps.internal.example.com/",
        policy,
        resolveHost,
      ),
    ).rejects.toThrow("WEB_URL_CIDR_NOT_ALLOWED");
  });

  it("rejects malformed URLs and embedded credentials", async () => {
    await expect(
      validateWebTargetUrl("not a url", policy, resolveInternal),
    ).rejects.toThrow("WEB_URL_INVALID");
    await expect(
      validateWebTargetUrl(
        "https://user:pass@apps.internal.example.com/",
        policy,
        resolveInternal,
      ),
    ).rejects.toThrow("WEB_URL_CREDENTIALS_FORBIDDEN");
  });

  it("accepts an IP literal that falls inside an allowed CIDR", async () => {
    const url = await validateWebTargetUrl(
      "https://10.20.30.40/dashboard",
      policy,
      async (hostname) => [{ address: hostname, family: 4 }],
    );
    expect(url.hostname).toBe("10.20.30.40");
  });

  it("rejects an IP literal outside the allowed CIDRs", async () => {
    await expect(
      validateWebTargetUrl(
        "https://8.8.8.8/dashboard",
        policy,
        async (hostname) => [{ address: hostname, family: 4 }],
      ),
    ).rejects.toThrow("WEB_URL_CIDR_NOT_ALLOWED");
  });

  it("supports the '*' wildcard hostname for permissive policies", async () => {
    const permissive: WebTargetPolicy = {
      protocols: ["http", "https"],
      allowedHostnames: ["*"],
      allowedPorts: [80, 443],
      allowedCidrs: ["0.0.0.0/0"],
    };
    const url = await validateWebTargetUrl(
      "https://anything.example.com/app",
      permissive,
      resolveInternal,
    );
    expect(url.hostname).toBe("anything.example.com");
  });
});
