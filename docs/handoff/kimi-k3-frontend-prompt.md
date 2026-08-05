# Kimi K3 — AI Hub Platform Frontend Build Prompt

**Date:** 2026-08-05
**Context:** Backend Phase 1–7 complete. Frontend is currently a temporary flat SPA (two files: `App.tsx` + `router.tsx`). This prompt asks you to rebuild it as a full frontend engineering project.

---

## Task

Rebuild `apps/web/src/` from a flat two-file SPA into a layered frontend project with proper separation of concerns: pages, components, modules, router, and shared infrastructure. The current static shell components should be decomposed into the target structure, preserving all existing behavior and tests, then new real-data pages should be built on top.

## Current State (what exists)

```
apps/web/src/
├── main.tsx            # entry point — creates root, renders <App />
├── styles.css          # global styles with Tailwind layers, skip-link, reduced-motion
├── app/
│   ├── App.tsx         # 10 lines: <AppProviders><AppRouter /></AppProviders>
│   ├── App.test.tsx    # 13 tests covering nav, routes, accessibility
│   ├── providers.tsx   # Ant Design ConfigProvider + TanStack QueryClientProvider
│   ├── router.tsx      # 957 lines — ALL components AND ALL routes in ONE FILE
│   ├── phase4.test.tsx
│   ├── phase6.test.tsx
│   └── identity-admin.test.tsx
└── test/
    ├── setup.ts
    ├── environment.ts
    └── icons.tsx
```

`router.tsx` contains these inline components mixed with route configuration:
- `AppShell`, `MarketplacePage`, `MarketplaceDetailPage`, `InnovationSquarePage`, `InnovationDemandDetailPage`, `NotificationsPage`, `CreatorCenterPage`, `ApplicationsPage`, `ApplicationDetailsPage`, `ApplicationVersionsPage`, `ApplicationReviewPage`, `ApplicationDeliveryPage`, `AnalyticsDashboardPage`, `OrganizationPage`, `SecurityPage`, `FeatureStatusPage`, `ApplicationAdminPage`
- All render static placeholder content. Zero API calls exist anywhere in the frontend.

## Target Architecture

```
apps/web/src/
├── main.tsx
├── App.tsx
├── styles.css
│
├── pages/                    ← one component per route, default-exported
│   ├── marketplace/
│   │   ├── MarketplacePage.tsx
│   │   └── MarketplaceDetailPage.tsx
│   ├── innovation/
│   │   ├── InnovationSquarePage.tsx
│   │   └── InnovationDemandDetailPage.tsx
│   ├── applications/
│   │   ├── ApplicationsPage.tsx
│   │   ├── ApplicationDetailsPage.tsx
│   │   ├── ApplicationVersionsPage.tsx
│   │   ├── ApplicationReviewPage.tsx
│   │   └── ApplicationDeliveryPage.tsx
│   ├── analytics/
│   │   └── AnalyticsDashboardPage.tsx
│   ├── organization/
│   │   └── OrganizationPage.tsx
│   ├── security/
│   │   └── SecurityPage.tsx
│   ├── notifications/
│   │   └── NotificationsPage.tsx
│   └── creator/
│       └── CreatorCenterPage.tsx
│
├── components/               ← shared UI, no API calls, no business logic
│   ├── layout/
│   │   ├── AppShell.tsx      ← skip-link, header, nav, <Outlet />
│   │   ├── Header.tsx
│   │   └── Navigation.tsx
│   └── common/
│       ├── FeatureStatusPage.tsx
│       └── HealthSnapshotCard.tsx
│
├── modules/                  ← domain logic, data fetching, state
│   ├── auth/
│   │   ├── auth.context.tsx
│   │   ├── useAuth.ts
│   │   └── auth.client.ts
│   ├── marketplace/
│   │   ├── marketplace.client.ts
│   │   └── useCatalog.ts
│   ├── application/
│   │   ├── application.client.ts
│   │   └── useApplication.ts
│   ├── interaction/
│   │   ├── interaction.client.ts
│   │   └── useInteraction.ts
│   ├── notification/
│   │   ├── notification.client.ts
│   │   └── useNotification.ts
│   ├── innovation/
│   │   ├── demand.client.ts
│   │   └── useDemand.ts
│   └── analytics/
│       ├── analytics.client.ts
│       └── useAnalytics.ts
│
├── router/
│   ├── index.ts              ← createBrowserRouter with lazy() routes
│   ├── routes.ts             ← ROUTES constant object
│   └── guards.ts             ← auth guards
│
├── shared/
│   ├── api/
│   │   └── client.ts         ← fetch wrapper with auth headers
│   └── types.ts
│
└── test/
    ├── setup.ts
    ├── environment.ts
    └── icons.tsx
```

## Layer Rules

```
pages ──► components ──► shared
  │           │
  └───────────┼──────► modules ──► shared

pages CAN import: components/, modules/, router/routes, shared/
pages CANNOT: import other pages, contain fetch calls directly

components CAN import: shared/, other components
components CANNOT: call APIs, import from modules/ (except type-only imports)

modules CAN import: shared/, TanStack Query
modules CANNOT: import React components (except context providers)

router CAN import: pages/ (lazy-loaded), modules/auth (guards)
router CANNOT: contain UI or business logic
```

## Phase 1: Decompose (no new features, preserve all tests)

### Step 1.1: Create directory scaffold

Create all the empty directories under `pages/`, `components/`, `modules/`, `router/`, `shared/`.

### Step 1.2: Extract `router/routes.ts`

```ts
// router/routes.ts
export const ROUTES = {
  home: "/",
  marketplace: "/marketplace",
  marketplaceDetail: "/marketplace/:applicationId",
  innovation: "/innovation",
  innovationDetail: "/innovation/:demandId",
  applications: "/applications",
  applicationDetail: "/applications/:applicationId",
  applicationVersions: "/applications/:applicationId/versions",
  applicationReview: "/applications/:applicationId/review",
  applicationDelivery: "/applications/:applicationId/delivery",
  analytics: "/analytics",
  organization: "/organization",
  security: "/security",
  notifications: "/notifications",
  creator: "/creator/:applicationId",
} as const;
```

### Step 1.3: Extract shared components

Pull `AppShell`, `Header`, `Navigation`, `FeatureStatusPage`, `HealthSnapshotCard`, and `ApplicationAdminPage` out of `router.tsx` into `components/`. Each component gets its own file. Export props interfaces.

### Step 1.4: Extract pages

Move each page component (MarketplacePage, InnovationSquarePage, etc.) into its own file under `pages/`. Each file default-exports the page component.

### Step 1.5: Rewrite `router/index.ts`

Use `lazy()` for every route to enable code splitting:

```ts
// router/index.ts
import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import { ROUTES } from "./routes";
import { AppShell } from "../components/layout/AppShell";

const MarketplacePage = lazy(() => import("../pages/marketplace/MarketplacePage"));
// ...etc

export function createRouter() {
  return createBrowserRouter([
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate replace to={ROUTES.marketplace} /> },
        { path: ROUTES.marketplace, element: <MarketplacePage /> },
        // ...
      ],
    },
  ]);
}
```

### Step 1.6: Verify all 13 existing tests still pass after decomposition

```
pnpm --filter @ai-hub/web test
```

If any test fails, fix the import paths.

## Phase 2: Shared API Client

### Step 2.1: Create `shared/api/client.ts`

```ts
// shared/api/client.ts
const BASE = ""; // same-origin, no prefix needed

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail?: string,
    public readonly traceId?: string,
  ) {
    super(detail ?? code);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers as Record<string, string>,
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.code ?? "UNKNOWN",
      body.detail,
      body.traceId,
    );
  }

  return response.json() as Promise<T>;
}
```

## Phase 3: Auth Module

### Step 3.1: Create `modules/auth/auth.client.ts`

Calls to `/internal/login/password`, `/internal/logout`, `/internal/actor`.

### Step 3.2: Create `modules/auth/auth.context.tsx`

React context providing `ActorContext | null`, `login()`, `logout()`, `isLoading`, `error`.

### Step 3.3: Create `modules/auth/useAuth.ts`

Hook to consume the auth context. Provides helpers like `hasRole(code)`, `isAuthenticated`.

### Step 3.4: Build login page at `pages/auth/LoginPage.tsx`

Employee ID + password form. Wire to `/login` route. Redirect to marketplace on success.

## Phase 4+: Build real pages

For each domain, follow this pattern:

1. **Module `.client.ts`** — typed API calls using `apiFetch`
2. **Module `use*.ts`** — TanStack Query hooks (`useQuery`, `useMutation`)
3. **Page** — composes components, calls hooks, handles loading/error/empty states

### Marketplace example

```ts
// modules/marketplace/marketplace.client.ts
import { apiFetch } from "../../shared/api/client";
import type { CatalogEntry } from "@ai-hub/contracts";

export function searchCatalog(query: string): Promise<CatalogEntry[]> {
  return apiFetch(`/internal/catalog?q=${encodeURIComponent(query)}`);
}
```

```ts
// modules/marketplace/useCatalog.ts
import { useQuery } from "@tanstack/react-query";
import { searchCatalog } from "./marketplace.client";

export function useCatalogSearch(query: string) {
  return useQuery({
    queryKey: ["catalog", "search", query],
    queryFn: () => searchCatalog(query),
    enabled: query.length > 0,
  });
}
```

```tsx
// pages/marketplace/MarketplacePage.tsx
import { Input, Spin, Alert, List } from "antd";
import { useCatalogSearch } from "../../modules/marketplace/useCatalog";
import { useState } from "react";

export default function MarketplacePage() {
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = useCatalogSearch(query);

  return (
    <div>
      <Input.Search onSearch={setQuery} placeholder="搜索应用" />
      {isLoading && <Spin />}
      {error && <Alert type="error" message={error.message} />}
      {data && <List dataSource={data} renderItem={(app) => <AppCard app={app} />} />}
    </div>
  );
}
```

## Code Conventions

- ESM only, strict TypeScript (inherited from `tsconfig.base.json`)
- One component per file, default-export for pages, named exports for utilities
- Tailwind for layout/spacing; Ant Design components for interactive elements
- No `!important` on Ant Design internals
- Chinese text for all user-facing strings
- Ant Design Icons only (`@ant-design/icons`)
- Semantic HTML: `aria-label` on nav, headings in hierarchy, skip link to `#main-content`
- Reduced motion: respect `prefers-reduced-motion`
- Responsive at 375, 768, 1024, 1440px

## Packages to Install

```bash
cd apps/web
pnpm add react-hook-form @hookform/resolvers zod echarts echarts-for-react motion
```

## Success Criteria

1. `pnpm --filter @ai-hub/web test` passes (all existing tests)
2. `pnpm --filter @ai-hub/web typecheck` passes
3. `pnpm --filter @ai-hub/web build` produces a working bundle
4. No files over 300 lines (decomposition verified)
5. Every route has a corresponding page file
6. API calls go through `shared/api/client.ts`
7. Business logic lives in `modules/`, not in pages or components
