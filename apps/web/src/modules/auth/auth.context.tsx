import type { ActorContext } from "@ai-hub/contracts";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { loginWithPassword, logoutSession } from "./auth.client";
import {
  getSession,
  setSession,
  subscribeSession,
  type AuthSession,
} from "./session.store";

export interface AuthContextValue {
  actor: ActorContext | null;
  error: string | null;
  hasRole: (code: string) => boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (employeeId: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  session: AuthSession | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSessionState] = useState<AuthSession | null>(() =>
    getSession(),
  );
  const [actor, setActor] = useState<ActorContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeSession((next) => {
        setSessionState(next);
        if (!next) {
          setActor(null);
        }
      }),
    [],
  );

  const login = useCallback(async (employeeId: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await loginWithPassword(employeeId, password);
      setActor(response.actor);
      setSession({
        employeeId: response.actor.employeeId,
        sessionId: response.actor.sessionId,
      });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请稍后重试");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const current = getSession();
    if (current) {
      await logoutSession(current.sessionId).catch(() => undefined);
    }
    setSession(null);
  }, []);

  const hasRole = useCallback(
    (code: string) => actor?.roleCodes.includes(code) ?? false,
    [actor],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      actor,
      error,
      hasRole,
      isAuthenticated: session !== null,
      isLoading,
      login,
      logout,
      session,
    }),
    [actor, error, hasRole, isLoading, login, logout, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
