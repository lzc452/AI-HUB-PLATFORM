# Frontend Handoff — AI Hub Platform

**Date:** 2026-08-05
**To:** Kimi K3 (Frontend)
**From:** Claude Code (Backend)
**Branch:** `development`

## 1. What Exists

### Backend (Phases 1–7 complete)

All NestJS API endpoints are implemented and tested. The API serves at `/internal/*` with session-based auth.

| Domain | Routes | Purpose |
|--------|--------|---------|
| **Identity** | `/internal/login/password`, `/internal/logout`, `/internal/actor`, `/internal/employees`, `/internal/departments`, `/internal/employees/:id/roles`, `/internal/employees/:id/revoke-sessions` | Auth, sessions, user/department/role listing |
| **Application** | `/internal/applications` (17 endpoints: CRUD, versions, 4-channel deliveries, review pool, publish/withdraw/archive/rollback) | Full application lifecycle |
| **Catalog** | `/internal/catalog` (search, list, detail, delivery-action recording) | Permission-filtered marketplace |
| **Interaction** | `/internal/applications/:id/likes`, `/.../ratings`, `/.../comments`, `/.../reports` | Likes, ratings, replies, moderation |
| **Creator** | `/internal/creator/:applicationId/summary` | Version diff, aggregate stats |
| **Notification** | `/internal/notifications` | In-app notification list, read state |
| **Demand** | `/internal/demands` (17 endpoints: draft, review, publish, claim, collaborate, prioritize, progress, pilot, merge, application-links) | Innovation demand lifecycle |
| **Analytics** | `/internal/analytics/dashboards`, `/internal/analytics/exports`, `/internal/analytics/assistant` | 9 fixed dashboards, audited exports, AI assistant |

All endpoints require `x-employee-id` header. Responses follow `ProblemDetails` shape on errors: `{ type, title, status, code, detail, traceId }`.

### Frontend (Phase 1 static shell only)

The current frontend is a temporary flat SPA — everything in two files (`App.tsx` 10 lines, `router.tsx` 957 lines). Every page renders hardcoded placeholder content with zero API calls.

**Target architecture**: a fully-layered frontend project. The current files are to be decomposed, not preserved.

### Shared Contracts

```ts
import type { ActorContext, CatalogEntry, DemandEntry, HealthSnapshot, ProblemDetails } from "@ai-hub/contracts";
// Full type exports: packages/contracts/src/index.ts
```

### Tech Stack (already configured)

| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.2 | UI |
| react-dom | 19.2 | DOM rendering |
| react-router-dom | 6.30 | Client-side routing |
| antd | 6.5 | Component library |
| @ant-design/icons | 6.1 | Icon set |
| @tanstack/react-query | 5.90 | Server state (already in QueryClientProvider) |
| tailwindcss | 4.1 | Utility CSS (no Preflight — does not reset Ant Design) |
| @tailwindcss/vite | 4.1 | Tailwind Vite plugin |
| @vitejs/plugin-react | 4.7 | React Fast Refresh |
| vite | 6.4 | Build tool |
| vitest | 3.2 | Test runner |
| @testing-library/react | 16.3 | Component tests |

Additional packages to install (specified in design but not yet added):
- `react-hook-form` + `zod` + `@hookform/resolvers` — form handling with validation
- `echarts` + `echarts-for-react` — fixed dashboards
- `motion` — animation primitives

## 2. Target Directory Structure

```
apps/web/src/
├── main.tsx                        # entry: createRoot, render <App />
├── App.tsx                         # compose providers + router
├── styles.css                      # global styles, skip-link, reduced-motion
│
├── pages/                          # route-level page components (one file per route)
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
├── components/                     # shared/reusable UI components
│   ├── layout/
│   │   ├── AppShell.tsx            # skip-link, Header, nav, <Outlet />
│   │   ├── Header.tsx
│   │   └── Navigation.tsx
│   └── common/
│       ├── FeatureStatusPage.tsx
│       └── HealthSnapshotCard.tsx
│
├── modules/                        # domain-specific logic per feature
│   ├── auth/
│   │   ├── auth.context.tsx        # React context for current user
│   │   ├── useAuth.ts             # hook: actor, login, logout, roles
│   │   └── auth.client.ts         # API calls: login, logout, getActor
│   ├── marketplace/
│   │   ├── marketplace.client.ts   # API calls: search, list, detail
│   │   ├── useCatalog.ts          # TanStack Query hooks
│   │   └── types.ts               # module-specific types
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
│   ├── index.ts                    # createBrowserRouter with lazy routes
│   ├── routes.ts                   # route path constants (ROUTES.marketplace, etc.)
│   └── guards.ts                   # route guards (auth, role checks)
│
├── shared/
│   ├── api/
│   │   └── client.ts              # fetch wrapper: base URL, auth headers, error normalization
│   └── types/
│
└── test/
    ├── setup.ts
    ├── environment.ts
    └── icons.tsx
```

## 3. Architectural Rules

### Layer dependency graph

```
pages ──► components ──► shared
  │           │
  └───────────┼──────► modules ──► shared
              │
              └──────► shared
```

| Layer | Allowed to | Forbidden to |
|-------|-----------|-------------|
| **pages/** | Import from `components/`, `modules/`, `router/routes`, `shared/` | Import from other pages; contain business logic |
| **components/** | Import from `shared/`, other components | Call APIs directly; import from `modules/` (except types); know about routes |
| **modules/** | Import from `shared/`; use TanStack Query | Import React components (except context providers); import from `pages/` or `components/` |
| **router/** | Import from `pages/` (lazy) | Contain UI |
| **shared/** | Only standard libraries and shared packages | Import from any app-specific layer |

### Page rules

- One React component per file, default-exported
- Pages compose components, call module hooks, handle loading/error states
- Pages never call `fetch` directly — always go through a module hook
- Page file names: `{Feature}Page.tsx` for list views, `{Feature}DetailPage.tsx` for detail views

### Component rules

- Props interface exported alongside the component
- Components receive data via props; never fetch their own data
- Shared components go in `components/common/`; layout components go in `components/layout/`
- Feature-specific compound components may live in the feature's page directory

### Module rules

- Each module exposes a public API through its index file (barrel export)
- `.client.ts` files contain raw `fetch` calls, return typed responses
- `use*.ts` files wrap `.client.ts` calls in TanStack Query hooks (`useQuery`, `useMutation`)
- Types local to a module stay in the module; cross-module types go in `shared/types/` or use `@ai-hub/contracts`

### Router rules

- Route paths defined as constants in `router/routes.ts`
- All routes use `lazy()` for code splitting
- Auth guards in `router/guards.ts` redirect unauthenticated users

## 4. Authentication Flow

```
POST /internal/login/password
  Body: { employeeId, password, deviceLabel }
  Response: { actor: ActorContext, session: { sessionId, ... } }
  Cookie: session=<httpOnly-cookie> (set by server)

GET /internal/actor
  Headers: x-employee-id
  Response: ActorContext

POST /internal/logout
  Headers: x-employee-id
```

Every API call needs: `Cookie` (automatic with `credentials: 'include'`) + `x-employee-id` header.

## 5. Running the App

```bash
# Full stack
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
# App at http://127.0.0.1:8080

# Frontend-only dev (API running elsewhere)
cd apps/web && pnpm dev --host 0.0.0.0
```

## 6. Key Constraints

- **Same-origin** — API and web served from one nginx, no CORS
- **CSRF** — production requires `x-csrf-token` header (read from `csrf-token` cookie)
- **No global state dump** — use TanStack Query for server state; don't duplicate employee/role into a giant store
- **Error shape** — all errors are `ProblemDetails { code, title, detail, traceId }`
- **Anonymous content** — `displayAnonymously` flag → UI shows "匿名用户"
- **Audience filtering** — server-side only; frontend never does client-side filtering
- **Chinese UI only** — all user-facing text in simplified Chinese
- **Ant Design + Tailwind** — Ant Design for interactive controls, Tailwind for layout/spacing; no `!important` overrides
- **Accessibility** — skip link, semantic headings, keyboard navigation, `prefers-reduced-motion`

## 7. Design Spec Reference

Full spec at `docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md`. Key sections for frontend:

- §4 — User workspaces (5 types of users, what each sees)
- §5.6 — Marketplace: search, filter, sort, detail, delivery actions
- §5.7 — Interactions: likes, ratings, comments, reports, anonymity
- §5.9 — Innovation square: demand forms, claim proposals, progress timeline
- §5.10 — Dashboards: 9 fixed dashboards, KPI cards, chart types
- §9 — Frontend module structure, visual design, Ant Design + Tailwind rules
- §9.4 — Core page interactions (publish wizard, review workbench, dashboards)

## 8. Suggested Build Order

1. **Decompose** — split `router.tsx` into pages/, components/layout/, router/ (adds zero features, preserves all tests)
2. **Shared API client** — `shared/api/client.ts` with auth headers, error normalization
3. **Auth module** — login page, auth context, `useAuth` hook, header with user display
4. **Marketplace** — first real data-fetching page (uses catalog API)
5. **Application detail + delivery** — click-through from marketplace
6. **Interactions** — likes, ratings, comments (small isolated components)
7. **Notification center** — simple list with read toggle
8. **Innovation square** — demand forms, listing, detail
9. **Publishing wizard** — multi-step form (most complex UI)
10. **Dashboards** — ECharts integration
11. **AI assistant** — chat panel (lowest priority)

## 9. Reference Files

| What | Where |
|------|-------|
| API implementations | `packages/server/src/<domain>/<domain>.controller.ts` |
| Shared types | `packages/contracts/src/<domain>.ts` |
| Database schema | `packages/database/src/schema.ts` |
| Ant Design theme | `packages/ui/src/theme.ts` |
| Vite config | `apps/web/vite.config.ts` |
| Design spec | `docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md` |
| Phase plans | `docs/superpowers/plans/` |
| ADRs | `docs/adr/` |
