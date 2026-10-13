import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useRef, type PropsWithChildren } from "react";

import { aiHubTheme } from "@ai-hub/ui";

import { AuthProvider } from "./modules/auth/auth.context";
import { clearLastViewedApplicationId } from "./modules/application/last-viewed";
import { useAuth } from "./modules/auth/useAuth";
import { queryClient } from "./query-client";
import { ErrorBoundary } from "./shared/ui/ErrorBoundary";

export { queryClient } from "./query-client";

function sessionKey(session: { employeeId: string } | null) {
  return session ? session.employeeId : null;
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
    // 兜底置于最外层：任一页面组件渲染抛错时降级为可重试的错误页，
    // 而不是整站白屏（审核工作台白屏会导致审核员无法工作）。
    <ErrorBoundary>
      <ConfigProvider locale={zhCN} theme={aiHubTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SessionQueryBoundary>{children}</SessionQueryBoundary>
          </AuthProvider>
        </QueryClientProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
}
