import { lazy, useMemo } from "react";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { RequireAuth, RequirePermission } from "./guards";
import { ROUTE_ACCESS } from "../modules/auth/roles";
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
const ApplicationCreateWizardPage = lazy(
  () => import("../pages/creator/ApplicationCreateWizardPage"),
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
const AssistantPage = lazy(() => import("../pages/assistant/AssistantPage"));

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
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.marketplace}>
                  <MarketplacePage />
                </RequirePermission>
              ),
              path: ROUTES.marketplace,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.marketplaceDetail}>
                  <MarketplaceDetailPage />
                </RequirePermission>
              ),
              path: ROUTES.marketplaceDetail,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.notifications}>
                  <NotificationsPage />
                </RequirePermission>
              ),
              path: ROUTES.notifications,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.creator}>
                  <ApplicationCreateWizardPage />
                </RequirePermission>
              ),
              path: ROUTES.creatorCreate,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.creator}>
                  <CreatorCenterPage />
                </RequirePermission>
              ),
              path: ROUTES.creator,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.applications}>
                  <ApplicationsPage />
                </RequirePermission>
              ),
              path: ROUTES.applications,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.applicationDetail}>
                  <ApplicationDetailsPage />
                </RequirePermission>
              ),
              path: ROUTES.applicationDetail,
            },
            {
              element: (
                <RequirePermission
                  requirement={ROUTE_ACCESS.applicationVersions}
                >
                  <ApplicationVersionsPage />
                </RequirePermission>
              ),
              path: ROUTES.applicationVersions,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.applicationReview}>
                  <ApplicationReviewPage />
                </RequirePermission>
              ),
              path: ROUTES.applicationReview,
            },
            {
              element: (
                <RequirePermission
                  requirement={ROUTE_ACCESS.applicationDelivery}
                >
                  <ApplicationDeliveryPage />
                </RequirePermission>
              ),
              path: ROUTES.applicationDelivery,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.innovation}>
                  <InnovationSquarePage />
                </RequirePermission>
              ),
              path: ROUTES.innovation,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.innovationDetail}>
                  <InnovationDemandDetailPage />
                </RequirePermission>
              ),
              path: ROUTES.innovationDetail,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.analytics}>
                  <AnalyticsDashboardPage />
                </RequirePermission>
              ),
              path: ROUTES.analytics,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.organization}>
                  <OrganizationPage />
                </RequirePermission>
              ),
              path: ROUTES.organization,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.security}>
                  <SecurityPage />
                </RequirePermission>
              ),
              path: ROUTES.security,
            },
            {
              element: (
                <RequirePermission requirement={ROUTE_ACCESS.assistant}>
                  <AssistantPage />
                </RequirePermission>
              ),
              path: ROUTES.assistant,
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
