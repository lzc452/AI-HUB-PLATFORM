import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../styles.css";
import { AppProviders } from "../providers";
import {
  AuthContext,
  type AuthContextValue,
} from "../modules/auth/auth.context";
import { AppRouter } from "../router";
import type { ActorContext } from "@ai-hub/contracts";

// 仅用于本地视觉验收：以超级管理员身份渲染真实应用路由与外壳，绕过鉴权守卫。
// 该文件不属于生产路由，不会被打包进应用产物。
const mockActor = {
  employeeId: "preview-admin",
  roleCodes: ["admin"],
  permissions: ["*"],
  departmentIds: [],
  primaryDepartmentId: "preview",
} as unknown as ActorContext;

const mockAuth: AuthContextValue = {
  actor: mockActor,
  error: null,
  hasPermission: () => true,
  canAccess: () => true,
  hasRole: () => false,
  isAuthenticated: true,
  isLoading: false,
  login: async () => false,
  logout: async () => {},
  session: { employeeId: "preview-admin" },
  startDingTalkLogin: async () => {},
  completeDingTalkLogin: async () => false,
};

// 让 BrowserRouter 认为当前路径是 AI 助手，从而渲染真实应用外壳与页面。
globalThis.history.replaceState({}, "", "/assistant");

function PreviewRoot() {
  return (
    <AppProviders>
      <AuthContext.Provider value={mockAuth}>
        <AppRouter />
      </AuthContext.Provider>
    </AppProviders>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PreviewRoot />
    </StrictMode>,
  );
}
