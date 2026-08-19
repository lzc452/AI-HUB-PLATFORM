import { afterEach, describe, expect, it } from "vitest";

import {
  buildSessionCookieAttributes,
  shouldSecureSessionCookie,
} from "./session-cookie.js";
import { IdentityController } from "./identity.controller.js";
import type { IdentityService } from "./identity.service.js";

/** 仅用于实例化控制器；sessionCookieHeaders 不依赖这些成员。 */
const stubIdentity = {} as IdentityService;

describe("session cookie attributes", () => {
  afterEach(() => {
    // 还原可能被子用例修改的环境变量，避免污染其它测试。
    delete process.env.NODE_ENV;
    delete process.env.AIHUB_SESSION_COOKIE_SECURE;
  });

  describe("buildSessionCookieAttributes", () => {
    it("非安全环境下包含 HttpOnly 与 SameSite=Lax，但不含 Secure", () => {
      const attrs = buildSessionCookieAttributes(false);
      expect(attrs).toContain("HttpOnly");
      expect(attrs).toContain("SameSite=Lax");
      expect(attrs).not.toContain("Secure");
      expect(attrs.startsWith("Path=/;")).toBe(true);
    });

    it("安全环境下额外包含 Secure（阻断明文 HTTP 降级泄露）", () => {
      const attrs = buildSessionCookieAttributes(true);
      expect(attrs).toContain("HttpOnly");
      expect(attrs).toContain("SameSite=Lax");
      expect(attrs).toContain("Secure");
    });
  });

  describe("shouldSecureSessionCookie", () => {
    it("开发/测试环境（非 production 且无覆盖）默认关闭 Secure", () => {
      process.env.NODE_ENV = "development";
      delete process.env.AIHUB_SESSION_COOKIE_SECURE;
      expect(shouldSecureSessionCookie()).toBe(false);
    });

    it("生产环境（NODE_ENV=production）自动开启 Secure", () => {
      process.env.NODE_ENV = "production";
      delete process.env.AIHUB_SESSION_COOKIE_SECURE;
      expect(shouldSecureSessionCookie()).toBe(true);
    });

    it("显式覆盖 AIHUB_SESSION_COOKIE_SECURE=false 可强制关闭（即使生产）", () => {
      process.env.NODE_ENV = "production";
      process.env.AIHUB_SESSION_COOKIE_SECURE = "false";
      expect(shouldSecureSessionCookie()).toBe(false);
    });

    it("显式覆盖 AIHUB_SESSION_COOKIE_SECURE=true 可强制开启（即使非生产）", () => {
      process.env.NODE_ENV = "test";
      process.env.AIHUB_SESSION_COOKIE_SECURE = "true";
      expect(shouldSecureSessionCookie()).toBe(true);
    });
  });

  describe("IdentityController.sessionCookieHeaders（真实代码路径）", () => {
    const controller = new IdentityController(stubIdentity);
    const session = {
      sessionId: "session-x",
      expiresAt: new Date(Date.now() + 60_000),
    };

    it("非生产环境产出 HttpOnly+SameSite=Lax 且无 Secure", () => {
      process.env.NODE_ENV = "development";
      delete process.env.AIHUB_SESSION_COOKIE_SECURE;
      const [sid, eid] = (
        controller as unknown as {
          sessionCookieHeaders: (s: typeof session, e: string) => string[];
        }
      ).sessionCookieHeaders(session, "E001");
      expect(sid).toContain("aihub_sid=session-x");
      expect(sid).toContain("HttpOnly");
      expect(sid).toContain("SameSite=Lax");
      expect(sid).not.toContain("Secure");
      expect(eid).toContain("aihub_eid=E001");
      expect(eid).toContain("HttpOnly");
    });

    it("生产环境产出包含 Secure 的会话 Cookie（阻断明文 HTTP 降级泄露）", () => {
      process.env.NODE_ENV = "production";
      delete process.env.AIHUB_SESSION_COOKIE_SECURE;
      const [sid] = (
        controller as unknown as {
          sessionCookieHeaders: (s: typeof session, e: string) => string[];
        }
      ).sessionCookieHeaders(session, "E001");
      expect(sid).toContain("Secure");
    });
  });
});
