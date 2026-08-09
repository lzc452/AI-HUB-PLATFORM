import { Spin } from "antd";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { ForbiddenBlock } from "../components/common/ForbiddenBlock";
import { useAuth } from "../modules/auth/useAuth";
import type { PermissionRequirement } from "../modules/auth/roles";
import { MessageError } from "../shared/ui/message";
import { ROUTES } from "./routes";

export function RequireAuth() {
  const { actor, error, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Spin aria-label="正在恢复会话" />;
  }
  if (!isAuthenticated) {
    return (
      <Navigate replace state={{ from: location.pathname }} to={ROUTES.login} />
    );
  }
  if (!actor) {
    return (
      <MessageError
        active
        cause={error}
        title="无法恢复当前身份"
      />
    );
  }

  return <Outlet />;
}

export interface RequirePermissionProps {
  children: React.ReactNode;
  requirement: PermissionRequirement;
}

export function RequirePermission({
  children,
  requirement,
}: RequirePermissionProps) {
  const { actor, canAccess, isLoading } = useAuth();
  if (isLoading || !actor) {
    return null;
  }
  if (!canAccess(requirement)) {
    return <ForbiddenBlock />;
  }
  return children;
}
