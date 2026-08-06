import { lazy, useMemo } from "react";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { RequireAuth } from "./guards";
import { ROUTES } from "./routes";

const LoginPage = lazy(() => import("../pages/auth/LoginPage"));
const MarketplacePage = lazy(
  () => import("../pages/marketplace/MarketplacePage"),
);
const MarketplaceDetailPage = lazy(
  () => import("../pages/marketplace/MarketplaceDetailPage"),
);
const InnovationSquarePage = lazy(
  () => import("../pages/innovation/InnovationSquarePage"),
);
const InnovationDemandDetailPage = lazy(
  () => import("../pages/innovation/InnovationDemandDetailPage"),
);
const NotificationsPage = lazy(
  () => import("../pages/notifications/NotificationsPage"),
);
const CreatorCenterPage = lazy(
  () => import("../pages/creator/CreatorCenterPage"),
);
const ApplicationsPage = lazy(
  () => import("../pages/applications/ApplicationsPage"),
);
const ApplicationDetailsPage = lazy(
  () => import("../pages/applications/ApplicationDetailsPage"),
);
const ApplicationVersionsPage = lazy(
  () => import("../pages/applications/ApplicationVersionsPage"),
);
const ApplicationReviewPage = lazy(
  () => import("../pages/applications/ApplicationReviewPage"),
);
const ApplicationDeliveryPage = lazy(
  () => import("../pages/applications/ApplicationDeliveryPage"),
);
const AnalyticsDashboardPage = lazy(
  () => import("../pages/analytics/AnalyticsDashboardPage"),
);
const OrganizationPage = lazy(
  () => import("../pages/organization/OrganizationPage"),
);
const SecurityPage = lazy(() => import("../pages/security/SecurityPage"));

export function createRouter() {
  return createBrowserRouter([
    {
      element: <LoginPage />,
      path: ROUTES.login,
    },
    {
      element: <AppShell />,
      children: [
        {
          element: <RequireAuth />,
          children: [
            {
              element: <Navigate replace to={ROUTES.marketplace} />,
              path: ROUTES.home,
            },
            {
              element: <MarketplacePage />,
              path: ROUTES.marketplace,
            },
            {
              element: <MarketplaceDetailPage />,
              path: ROUTES.marketplaceDetail,
            },
            {
              element: <NotificationsPage />,
              path: ROUTES.notifications,
            },
            {
              element: <CreatorCenterPage />,
              path: ROUTES.creator,
            },
            {
              element: <ApplicationsPage />,
              path: ROUTES.applications,
            },
            {
              element: <ApplicationDetailsPage />,
              path: ROUTES.applicationDetail,
            },
            {
              element: <ApplicationVersionsPage />,
              path: ROUTES.applicationVersions,
            },
            {
              element: <ApplicationReviewPage />,
              path: ROUTES.applicationReview,
            },
            {
              element: <ApplicationDeliveryPage />,
              path: ROUTES.applicationDelivery,
            },
            {
              element: <InnovationSquarePage />,
              path: ROUTES.innovation,
            },
            {
              element: <InnovationDemandDetailPage />,
              path: ROUTES.innovationDetail,
            },
            {
              element: <AnalyticsDashboardPage />,
              path: ROUTES.analytics,
            },
            {
              element: <OrganizationPage />,
              path: ROUTES.organization,
            },
            {
              element: <SecurityPage />,
              path: ROUTES.security,
            },
          ],
        },
      ],
    },
  ]);
}

export function AppRouter() {
  const router = useMemo(() => createRouter(), []);

  return <RouterProvider router={router} />;
}
