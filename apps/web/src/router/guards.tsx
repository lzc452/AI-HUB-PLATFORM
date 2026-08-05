import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../modules/auth/useAuth";
import { ROUTES } from "./routes";

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        replace
        state={{ from: location.pathname }}
        to={ROUTES.login}
      />
    );
  }

  return <Outlet />;
}
