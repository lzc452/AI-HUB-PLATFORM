import { createHash, randomBytes } from "node:crypto";
import type { IdentityService } from "./identity.service.js";
import type { IdentityRepository, LoginResult } from "./identity.types.js";
import type { DingTalkApiPort } from "./dingtalk-api.client.js";

const SSO_TTL_MS = 10 * 60 * 1000; // 10 minutes for OAuth flow
const HANDOFF_TTL_MS = 2 * 60 * 1000; // 2 minutes for handoff cookie
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function isValidReturnTo(returnTo: string): boolean {
  // Must be a same-site relative path.
  if (returnTo === "") return true; // empty → default
  if (!returnTo.startsWith("/")) return false;
  if (returnTo.includes("//")) return false;
  if (returnTo.includes("@")) return false;
  // No protocol prefix
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(returnTo)) return false;
  return true;
}

export interface DingTalkSsoConfig {
  clientId: string;
  clientSecret: string;
  corpId: string;
  redirectUri: string;
}

export interface SsoStartResult {
  redirectUrl: string;
  browserBindingCookie: string;
  stateCookie: string;
}

export interface SsoCallbackResult {
  handoffToken: string;
  returnTo: string;
}

export class DingTalkSsoService {
  constructor(
    private readonly config: DingTalkSsoConfig,
    private readonly api: DingTalkApiPort,
    private readonly repository: IdentityRepository,
    private readonly identityService: IdentityService,
  ) {}

  /** Start the DingTalk OAuth 2.0 authorization flow. */
  async startSso(returnTo: string): Promise<SsoStartResult> {
    if (!isValidReturnTo(returnTo)) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    const state = randomBytes(32).toString("base64url");
    const handoffToken = randomBytes(32).toString("base64url");
    const browserBinding = randomBytes(32).toString("base64url");

    const stateHash = sha256hex(state);
    const browserBindingHash = sha256hex(browserBinding);
    const handoffHash = sha256hex(handoffToken);
    const expiresAt = new Date(Date.now() + SSO_TTL_MS);

    await this.repository.createDingTalkSsoTransaction({
      stateHash,
      browserContextBindingHash: browserBindingHash,
      handoffTokenHash: handoffHash,
      returnTo: returnTo || "/marketplace",
      expiresAt,
    });

    const redirectUrl = new URL("https://login.dingtalk.com/oauth2/auth");
    redirectUrl.searchParams.set("response_type", "code");
    redirectUrl.searchParams.set("client_id", this.config.clientId);
    redirectUrl.searchParams.set("redirect_uri", this.config.redirectUri);
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("scope", "openid corpid");
    redirectUrl.searchParams.set("prompt", "consent");

    return {
      redirectUrl: redirectUrl.toString(),
      browserBindingCookie: `dingtalk_binding=${browserBinding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SSO_TTL_MS / 1000}`,
      stateCookie: `dingtalk_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SSO_TTL_MS / 1000}`,
    };
  }

  /**
   * Handle the OAuth 2.0 callback from DingTalk.
   * Verifies state, exchanges code, and creates a handoff token.
   */
  async handleCallback(
    state: string,
    code: string,
    browserBindingCookie?: string,
    stateCookie?: string,
  ): Promise<SsoCallbackResult> {
    // Verify state cookie matches state param.
    if (stateCookie === undefined || stateCookie !== state) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    // Verify browser binding cookie.
    if (browserBindingCookie === undefined) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    const stateHash = sha256hex(state);
    const bindingHash = sha256hex(browserBindingCookie);

    const transaction =
      await this.repository.findDingTalkSsoTransactionByStateHash(stateHash);

    if (transaction === null) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    if (transaction.consumedAt !== null) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    if (transaction.expiresAt.getTime() <= Date.now()) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    // Verify browser context binding.
    if (transaction.browserContextBindingHash !== bindingHash) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    // Exchange code for access token.
    const token = await this.api.exchangeCodeForToken(code);

    // Get user info from DingTalk.
    const userInfo = await this.api.getUserInfo(token.accessToken);

    // Store dingtalk_user_id on the transaction.
    await this.repository.updateDingTalkSsoTransactionAfterCallback(
      transaction.transactionId,
      userInfo.dingtalkUserId,
    );

    // Generate fresh handoff token.
    const handoffToken = randomBytes(32).toString("base64url");
    const handoffHash = sha256hex(handoffToken);

    // Update transaction with new handoff and short expiry.
    // Note: we re-create the transaction with handoff hash for the complete step.
    const handoffExpiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
    await this.repository.createDingTalkSsoTransaction({
      stateHash: sha256hex(handoffToken), // reuse state_hash field for handoff lookup
      browserContextBindingHash: transaction.browserContextBindingHash,
      handoffTokenHash: handoffHash,
      returnTo: transaction.returnTo,
      expiresAt: handoffExpiresAt,
    });

    return {
      handoffToken,
      returnTo: transaction.returnTo,
    };
  }

  /**
   * Complete SSO: consume handoff token, bind identity, create session.
   */
  async completeSso(handoffToken: string): Promise<LoginResult> {
    const handoffHash = sha256hex(handoffToken);

    const transaction =
      await this.repository.findDingTalkSsoTransactionByHandoffHash(
        handoffHash,
      );

    if (transaction === null) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    if (transaction.consumedAt !== null) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    if (transaction.expiresAt.getTime() <= Date.now()) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    if (transaction.dingtalkUserId === null) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    // Check if this DingTalk user is already bound to someone else.
    const alreadyBound = await this.repository.findEmployeeByDingTalkUserId(
      transaction.dingtalkUserId,
    );
    if (alreadyBound !== null) {
      throw new Error("DINGTALK_SSO_ALREADY_BOUND");
    }

    // Look up employee by standardized employee_number.
    const standardized = this.identityService.standardizeEmployeeNumber(
      transaction.dingtalkUserId,
    );

    // For now, search by dingtalkUserId matching employee_id directly
    // (since employee_number column may not be populated yet).
    const employee = await this.repository.findEmployee(standardized);

    if (employee === null) {
      throw new Error("DINGTALK_SSO_USER_NOT_FOUND");
    }

    if (employee.status === "disabled" || employee.status === "archived") {
      throw new Error("DINGTALK_SSO_ACCOUNT_DISABLED");
    }

    // Consume the transaction atomically.
    const consumed = await this.repository.consumeDingTalkSsoTransaction(
      transaction.transactionId,
    );
    if (!consumed) {
      throw new Error("DINGTALK_SSO_STATE_INVALID");
    }

    // Activate if pending_binding.
    if (employee.status === "pending_binding") {
      await this.repository.activateEmployee(employee.employeeId);
    }

    // Bind DingTalk user ID.
    await this.repository.bindDingTalkUser(
      employee.employeeId,
      transaction.dingtalkUserId,
    );

    // Create session.
    const session = await this.repository.createSession({
      employeeId: employee.employeeId,
      deviceLabel: "dingtalk_sso",
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    // Build actor context.
    const actor = await this.identityService.getActorContext(
      employee.employeeId,
      session.sessionId,
    );

    // Audit.
    await this.repository.recordAudit({
      actorEmployeeId: employee.employeeId,
      eventType: "identity.dingtalk.sso.login",
      subjectEmployeeId: employee.employeeId,
      details: {
        dingtalkUserId: transaction.dingtalkUserId,
        sessionId: session.sessionId,
      },
    });

    return { actor, session };
  }
}
