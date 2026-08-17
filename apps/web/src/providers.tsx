import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useRef, type PropsWithChildren } from "react";

import { aiHubTheme } from "@ai-hub/ui";

import { AuthProvider } from "./modules/auth/auth.context";
import { clearLastViewedApplicationId } from "./modules/application/last-viewed";
import { useAuth } from "./modules/auth/useAuth";
import { queryClient } from "./query-client";

export { queryClient } from "./query-client";

function sessionKey(session: { employeeId: string; sessionId: string } | null) {
  return session ? `${session.employeeId}:${session.sessionId}` : null;
}

export function clearSessionScopedState(client: QueryClient): void {
  void client.cancelQueries();
  client.clear();
  clearLastViewedApplicationId();
}

function SessionQueryBoundary({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const previousSessionKey = useRef(sessionKey(session));

  useEffect(() => {
    const nextSessionKey = sessionKey(session);
    if (previousSessionKey.current !== nextSessionKey) {
      clearSessionScopedState(queryClient);
    }
    previousSessionKey.current = nextSessionKey;
  }, [session]);

  return children;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider locale={zhCN} theme={aiHubTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SessionQueryBoundary>{children}</SessionQueryBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
