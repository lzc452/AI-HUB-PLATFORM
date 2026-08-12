import type { ActorContext } from "@ai-hub/contracts";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  fetchActor,
  fetchLoginChallenge,
  loginWithEnvelope,
  loginWithPassword,
  logoutSession,
  startDingTalkSso,
  completeDingTalkSso,
} from "./auth.client";
import { buildLoginEnvelope } from "./login-encryption";
import {
  canAccess as canAccessRequirement,
  hasPermission as actorHasPermission,
  type PermissionRequirement,
} from "./roles";
import {
  getSession,
  setSession,
  subscribeSession,
  type AuthSession,
} from "./session.store";
import { showSuccessMessage } from "../../shared/ui/message";

function sessionKey(session: Pick<AuthSession, "employeeId" | "sessionId">) {
  return `${session.employeeId}:${session.sessionId}`;
}

function actorMatchesSession(
  actor: ActorContext | null,
  session: AuthSession | null,
): boolean {
  return Boolean(
    actor &&
      session &&
      actor.employeeId === session.employeeId &&
      actor.sessionId === session.sessionId,
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "会话恢复失败，请稍后重试";
}

export interface AuthContextValue {
  actor: ActorContext | null;
  error: string | null;
  hasPermission: (permission: string) => boolean;
  canAccess: (requirement?: PermissionRequirement) => boolean;
  hasRole: (code: string) => boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (employeeId: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  session: AuthSession | null;
  /** Start DingTalk SSO OAuth flow (redirects browser). */
  startDingTalkLogin: (returnTo?: string) => Promise<void>;
  /** Complete DingTalk SSO after OAuth callback. */
  completeDingTalkLogin: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const initialSession = getSession();
  const [session, setSessionState] = useState<AuthSession | null>(
    initialSession,
  );
  const [actor, setActorState] = useState<ActorContext | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(initialSession));
  const [error, setError] = useState<string | null>(null);
  const actorRef = useRef<ActorContext | null>(null);
  const sessionRef = useRef<AuthSession | null>(initialSession);
  const hydratedSessionKeyRef = useRef<string | null>(null);
  const requestVersionRef = useRef(0);

  const setActor = useCallback((next: ActorContext | null) => {
    actorRef.current = next;
    setActorState(next);
  }, []);

  useEffect(
    () =>
      subscribeSession((next) => {
        sessionRef.current = next;
        setSessionState(next);
        if (!next) {
          hydratedSessionKeyRef.current = null;
          setActor(null);
          setError(null);
          setIsLoading(false);
          return;
        }

        const nextKey = sessionKey(next);
        if (actorMatchesSession(actorRef.current, next)) {
          hydratedSessionKeyRef.current = nextKey;
          setError(null);
          setIsLoading(false);
        } else {
          hydratedSessionKeyRef.current = null;
          setActor(null);
          setError(null);
          setIsLoading(true);
        }
      }),
    [setActor],
  );

  useEffect(() => {
    const current = session;
    if (!current) {
      setActor(null);
      setIsLoading(false);
      return;
    }

    const currentKey = sessionKey(current);
    if (
      hydratedSessionKeyRef.current === currentKey &&
      actorMatchesSession(actorRef.current, current)
    ) {
      setIsLoading(false);
      return;
    }

    const requestVersion = ++requestVersionRef.current;
    setActor(null);
    setError(null);
    setIsLoading(true);

    fetchActor()
      .then((nextActor) => {
        if (
          requestVersion !== requestVersionRef.current ||
          !actorMatchesSession(nextActor, sessionRef.current)
        ) {
          return;
        }
        hydratedSessionKeyRef.current = currentKey;
        setActor(nextActor);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        // apiFetch clears the session before rejecting a 401. Avoid showing a
        // transient network error after that state transition.
        if (!sessionRef.current) {
          return;
        }
        setActor(null);
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (requestVersion === requestVersionRef.current) {
          setIsLoading(false);
        }
      });
  }, [session, setActor]);

  const login = useCallback(
    async (employeeId: string, password: string) => {
      const requestVersion = ++requestVersionRef.current;
      setIsLoading(true);
      setError(null);
      try {
        // Two-step encrypted login: fetch challenge → build envelope → POST.
        const challenge = await fetchLoginChallenge();
        const envelope = await buildLoginEnvelope(
          employeeId,
          password,
          challenge,
        );
        const response = await loginWithEnvelope(employeeId, envelope);
        if (requestVersion !== requestVersionRef.current) {
          return false;
        }
        const nextSession = {
          employeeId: response.actor.employeeId,
          sessionId: response.actor.sessionId,
        };
        hydratedSessionKeyRef.current = sessionKey(nextSession);
        setActor(response.actor);
        setSession(nextSession);
        setIsLoading(false);
        showSuccessMessage("登录成功");
        return true;
      } catch {
        if (requestVersion === requestVersionRef.current) {
          // Fall back to legacy plaintext login if encryption fails.
          try {
            const response = await loginWithPassword(employeeId, password);
            if (requestVersion !== requestVersionRef.current) return false;
            const nextSession = {
              employeeId: response.actor.employeeId,
              sessionId: response.actor.sessionId,
            };
            hydratedSessionKeyRef.current = sessionKey(nextSession);
            setActor(response.actor);
            setSession(nextSession);
            setIsLoading(false);
            showSuccessMessage("登录成功");
            return true;
          } catch {
            if (requestVersion === requestVersionRef.current) {
              setError("工号或密码错误（用户名或密码错误）");
              setActor(null);
              setIsLoading(false);
            }
            return false;
          }
        }
        return false;
      }
    },
    [setActor],
  );

  const startDingTalkLogin = useCallback(async (returnTo = "/marketplace") => {
    try {
      const result = await startDingTalkSso(returnTo);
      window.location.href = result.redirectUrl;
    } catch {
      setError("钉钉登录暂不可用");
    }
  }, []);

  const completeDingTalkLogin = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await completeDingTalkSso();
      if (requestVersion !== requestVersionRef.current) return false;
      const nextSession = {
        employeeId: response.actor.employeeId,
        sessionId: response.actor.sessionId,
      };
      hydratedSessionKeyRef.current = sessionKey(nextSession);
      setActor(response.actor);
      setSession(nextSession);
      setIsLoading(false);
      showSuccessMessage("钉钉登录成功");
      return true;
    } catch {
      if (requestVersion === requestVersionRef.current) {
        setError("钉钉登录失败，请重试");
        setActor(null);
        setIsLoading(false);
      }
      return false;
    }
  }, [setActor]);

  const logout = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    const current = getSession();
    try {
      if (current) {
        await logoutSession(current.sessionId);
      }
    } catch {
      // 本地会话仍然必须清除，避免退出后继续使用旧身份。
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setSession(null);
      }
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string) => actorHasPermission(actor, permission),
    [actor],
  );
  const canAccess = useCallback(
    (requirement?: PermissionRequirement) =>
      canAccessRequirement(actor, requirement),
    [actor],
  );
  const hasRole = useCallback(
    (code: string) => actor?.roleCodes.includes(code) ?? false,
    [actor],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      actor,
      error,
      hasPermission,
      canAccess,
      hasRole,
      isAuthenticated: session !== null,
      isLoading,
      login,
      logout,
      session,
      startDingTalkLogin,
      completeDingTalkLogin,
    }),
    [
      actor,
      canAccess,
      error,
      hasPermission,
      hasRole,
      isLoading,
      login,
      logout,
      session,
      startDingTalkLogin,
      completeDingTalkLogin,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
