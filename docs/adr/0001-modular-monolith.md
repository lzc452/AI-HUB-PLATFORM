# ADR 0001: React SPA and NestJS Modular Monolith

- Status: Accepted
- Date: 2026-07-31

## Context

AI Hub V1 needs independently deployable Web, API, and background worker
processes while the product and domain boundaries are still evolving. The team
needs one transactional data model, explicit package boundaries, and a simple
local development topology.

## Decision

Use a React single-page application built with Vite for the Web process. Use
NestJS for the API and worker entrypoints, with domain capabilities organized as
modules inside one TypeScript monorepo. Enforce package exports and dependency
rules so modules communicate through stable public interfaces.

## Consequences

- Web delivery remains independent from the API runtime.
- API and worker can share infrastructure modules without sharing process state.
- PostgreSQL transactions can span related server-side module operations.
- A future service extraction requires an explicit operational and domain case.

## Rejected Alternatives

- Next.js full-stack: rejected because V1 does not need server-rendered React or
  a second server-side application framework.
- Microservices: rejected because the operational and distributed-transaction
  cost is not justified before domain boundaries and scaling needs are proven.
