# AI Hub Phase 2 Identity Organization Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution status (2026-08-03):** Phase 2 V1 scope completed. Full `pnpm verify` passed with Docker/Testcontainers available. Remaining risk is external DingTalk OAuth credentials and deployment-specific security policy.

**Goal:** Deliver the V1 identity, organization, session, DingTalk binding/sync, RBAC, audience, and unified authorization baseline required by Phase 3.

**Architecture:** Phase 2 is implemented as a deep `identity` module in `packages/server`, backed by Kysely tables in `packages/database` and stable contracts in `packages/contracts`. API endpoints only call public service interfaces, and all state-changing flows emit audit/outbox events inside the same PostgreSQL transaction boundary.

**Tech Stack:** Node.js >=18.18, TypeScript strict mode, NestJS 10, Kysely, PostgreSQL 18, Vitest, React/Vite/Ant Design.

## Global Constraints

- Single enterprise, single instance; do not introduce `tenant_id`.
- Employee ID is the immutable, never-reused primary employee key.
- Passwords are local fallback credentials and must be strongly hashed.
- DingTalk unavailability must not block password login for employees with configured passwords.
- Authorization denial must not reveal whether a restricted object exists.
- Role, organization, disable/archive, and password-reset changes must revoke necessary sessions.
- No Redis, message queue, Elasticsearch, Kubernetes, public Open API, or microservices in V1.

---

## File Structure

```text
packages/contracts/src/identity.ts
packages/database/src/migrations/0002_identity_organization_authorization.ts
packages/database/src/schema.ts
packages/server/src/identity/
  identity.types.ts
  password.service.ts
  password.service.test.ts
  identity.repository.ts
  identity.service.ts
  identity.service.test.ts
  identity.controller.ts
  identity.module.ts
apps/api/src/api.module.ts
apps/api/test/identity.e2e-spec.ts
apps/web/src/app/router.tsx
apps/web/src/app/App.test.tsx
processing_visualization.html
```

## Stable Interfaces Produced by This Phase

```ts
export type EmployeeId = string;
export type ResourceId = string;

export interface ActorContext {
  employeeId: EmployeeId;
  roleCodes: readonly string[];
  departmentIds: readonly string[];
  primaryDepartmentId: string;
  sessionId: string;
}

export interface AuthorizationRequest {
  actor: ActorContext;
  action: string;
  resourceType: string;
  resourceId?: ResourceId;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: string;
}
```

## Tasks

### Task 1: Contracts and Database Baseline

**Files:**
- Create `packages/contracts/src/identity.ts`
- Modify `packages/contracts/src/index.ts`
- Create `packages/database/src/migrations/0002_identity_organization_authorization.ts`
- Modify `packages/database/src/migrate.ts`
- Modify `packages/database/src/schema.ts`

**Acceptance:** migrations create employees, departments, memberships, roles, user roles, sessions, DingTalk bindings, DingTalk sync runs, password reset challenges, and audit events without `tenant_id`.

### Task 2: Password, Session, and Local Login

**Files:**
- Create `packages/server/src/identity/password.service.ts`
- Create `packages/server/src/identity/identity.service.ts`
- Create tests beside both services.

**Acceptance:** ASCII-only 8+ character passwords are hashed with `crypto.scrypt`; login succeeds with active employees and revokes no unrelated sessions; disabled/archive/pending-binding employees cannot password-login.

### Task 3: Organization and DingTalk Sync Ports

**Files:**
- Extend `identity.service.ts`
- Add repository methods for departments, memberships, and DingTalk bindings.

**Acceptance:** local records are editable, DingTalk-sourced fields are not overwritten by local edits, daily/manual sync runs are auditable, and first OAuth binding is keyed by employee ID.

### Task 4: RBAC and Unified Authorization

**Files:**
- Extend contracts and `identity.service.ts`
- Add audience evaluator interfaces.

**Acceptance:** predefined/custom platform roles resolve into `ActorContext`; `authorize()` returns generic denial reason codes and never checks object existence before permission/audience rules.

### Task 5: API and Web Administration Surface

**Files:**
- Create `identity.controller.ts` and `identity.module.ts`
- Modify `apps/api/src/api.module.ts`
- Modify web shell routes.

**Acceptance:** internal admin endpoints expose current actor, roles, employees, departments, local login, logout, and session revocation primitives; web shell has organization/security placeholders wired to routes.

### Task 6: Verification and Gate

**Files:**
- Add e2e tests and update `processing_visualization.html`.

**Acceptance:** `pnpm verify` passes; targeted identity tests pass; documentation records Phase 2 decisions and remaining external DingTalk credentials risk.
