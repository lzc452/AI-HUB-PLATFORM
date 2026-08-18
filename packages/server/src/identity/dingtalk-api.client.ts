/**
 * DingTalk OAuth 2.0 API client.
 *
 * ClientSecret and AccessToken are never logged — this module uses
 * structured error codes instead of raw API responses.
 *
 * 出站请求统一经过 `assertPublicHttpTarget` 校验（中危-4）：即便未来把 URL 改为
 * 用户可控来源，也能拒绝私有/链路本地/云元数据目标，并在 DNS 解析到私有地址时拦截。
 * 当前 URL 为硬编码常量，校验结果按 URL 缓存，避免每次 SSO 都做 DNS 查询；
 * 若某 URL 校验失败（如瞬时 DNS 异常），缓存的拒绝态会被清除以便下次重试。
 */

import { assertPublicHttpTarget } from "../system/security/ssrf-policy.js";

const DINGTALK_TOKEN_URL =
  "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
const DINGTALK_USERINFO_URL = "https://api.dingtalk.com/v1.0/contact/users/me";

export interface DingTalkTokenResponse {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresIn: number;
}

export interface DingTalkUserInfo {
  dingtalkUserId: string;
  unionId?: string | undefined;
  /** Employee job number from DingTalk organization. */
  employeeNumber: string;
  /** Display name in DingTalk. */
  nick?: string | undefined;
}

export interface DingTalkApiPort {
  exchangeCodeForToken(code: string): Promise<DingTalkTokenResponse>;
  getUserInfo(accessToken: string): Promise<DingTalkUserInfo>;
}

export class DingTalkApiClient implements DingTalkApiPort {
  private readonly validatedTargets = new Map<string, Promise<URL>>();

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  /** 校验外部目标为公开地址并缓存结果（SSRF 防护）。 */
  private assertTarget(rawUrl: string): Promise<URL> {
    let pending = this.validatedTargets.get(rawUrl);
    if (pending === undefined) {
      pending = assertPublicHttpTarget(rawUrl).catch((error: unknown) => {
        // 校验失败时移除缓存，允许下次调用重试，而不是永久缓存拒绝态。
        this.validatedTargets.delete(rawUrl);
        throw error;
      });
      this.validatedTargets.set(rawUrl, pending);
    }
    return pending;
  }

  async exchangeCodeForToken(code: string): Promise<DingTalkTokenResponse> {
    const target = await this.assertTarget(DINGTALK_TOKEN_URL);
    const body = new URLSearchParams({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      code,
      grantType: "authorization_code",
    });

    const response = await fetch(target.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error("DINGTALK_SSO_CODE_EXCHANGE_FAILED");
    }

    const json = (await response.json()) as Record<string, unknown>;

    if (
      typeof json.accessToken !== "string" ||
      typeof json.expireIn !== "number"
    ) {
      throw new Error("DINGTALK_SSO_CODE_EXCHANGE_FAILED");
    }

    const result: DingTalkTokenResponse = {
      accessToken: json.accessToken,
      expiresIn: json.expireIn,
    };
    if (typeof json.refreshToken === "string") {
      result.refreshToken = json.refreshToken;
    }
    return result;
  }

  async getUserInfo(accessToken: string): Promise<DingTalkUserInfo> {
    const target = await this.assertTarget(DINGTALK_USERINFO_URL);
    const response = await fetch(target.toString(), {
      headers: {
        "x-acs-dingtalk-access-token": accessToken,
      },
    });

    if (!response.ok) {
      throw new Error("DINGTALK_SSO_CODE_EXCHANGE_FAILED");
    }

    const json = (await response.json()) as Record<string, unknown>;

    if (typeof json.openId !== "string") {
      throw new Error("DINGTALK_SSO_CODE_EXCHANGE_FAILED");
    }

    const info: DingTalkUserInfo = {
      dingtalkUserId: json.openId,
      employeeNumber: typeof json.jobNumber === "string" ? json.jobNumber : "",
    };
    if (typeof json.unionId === "string") {
      info.unionId = json.unionId;
    }
    if (typeof json.nick === "string") {
      info.nick = json.nick;
    }
    return info;
  }
}
