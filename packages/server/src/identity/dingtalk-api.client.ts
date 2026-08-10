/**
 * DingTalk OAuth 2.0 API client.
 *
 * ClientSecret and AccessToken are never logged — this module uses
 * structured error codes instead of raw API responses.
 */

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
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async exchangeCodeForToken(code: string): Promise<DingTalkTokenResponse> {
    const body = new URLSearchParams({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      code,
      grantType: "authorization_code",
    });

    const response = await fetch(
      "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

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
    const response = await fetch(
      "https://api.dingtalk.com/v1.0/contact/users/me",
      {
        headers: {
          "x-acs-dingtalk-access-token": accessToken,
        },
      },
    );

    if (!response.ok) {
      throw new Error("DINGTALK_SSO_CODE_EXCHANGE_FAILED");
    }

    const json = (await response.json()) as Record<string, unknown>;

    if (typeof json.openId !== "string") {
      throw new Error("DINGTALK_SSO_CODE_EXCHANGE_FAILED");
    }

    const info: DingTalkUserInfo = {
      dingtalkUserId: json.openId,
      employeeNumber:
        typeof json.jobNumber === "string" ? json.jobNumber : "",
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
