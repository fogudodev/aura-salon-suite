# Frontend Audit and Domain Refactor Plan

## Executive Summary

The frontend works, builds, and already covers a large product surface. The main problem is not framework choice or missing libraries. The main problem is domain sprawl inside pages, hooks, and route configuration.

The frontend currently scales by accumulation. It does not yet scale by boundaries.

## Main Findings

### 1. Route registry is monolithic

File: `src/App.tsx`

`App.tsx` currently concentrates public, authenticated, admin, support, and course routes in one file.

Impact:

- routing changes are high-risk
- route ownership is unclear
- access rules are harder to audit

### 2. Core pages are oversized

Measured file sizes:

- `src/pages/PublicBooking.tsx`: 909 lines
- `src/pages/Settings.tsx`: 1481 lines
- `src/pages/Reports.tsx`: 605 lines
- `src/pages/Automations.tsx`: 274 lines

Impact:

- business logic, state orchestration, API access, and UI rendering are mixed
- testability is poor
- any domain change becomes a page rewrite

### 3. Access control is split across multiple hooks and route components

Files:

- `src/components/auth/ProtectedRoute.tsx`
- `src/components/auth/AdminRoute.tsx`
- `src/hooks/useFeatureAccess.tsx`
- `src/hooks/useMyFeatureGate.tsx`
- `src/hooks/useAdmin.tsx`

Impact:

- plan gating, role gating, and override gating are not fully unified
- route protection logic is duplicated across role and feature layers
- frontend can become inconsistent with backend entitlements

### 4. Hooks are acting as both repository and service layer

Examples:

- `src/hooks/useBookings.tsx`
- `src/hooks/useWhatsApp.tsx`
- `src/hooks/useAdmin.tsx`
- `src/hooks/useCourses.tsx`

Impact:

- hooks own transport, cache, mutation side effects, and business meaning at the same time
- data contracts are weak
- many hooks rely on broad `select("*")` or permissive typing

### 5. Lint debt is concentrated in operational domains

Current lint baseline is dominated by `any` usage in:

- admin
- analytics
- WhatsApp
- booking
- courses

This indicates the least typed parts of the app are also the most business-critical.

## Proposed Domain Refactor

### Target domain modules

1. `auth-access`
2. `booking-scheduling`
3. `whatsapp-automation`
4. `billing-subscriptions`
5. `courses`
6. `admin-ops`
7. `analytics-reporting`
8. `shared-ui`

### Recommended folder direction

Suggested target structure:

```text
src/
  domains/
    auth-access/
    booking-scheduling/
    whatsapp-automation/
    billing-subscriptions/
    courses/
    admin-ops/
    analytics-reporting/
  app/
    router/
    providers/
  shared/
    ui/
    lib/
    hooks/
```

## Refactor by Area

### Auth and access

Current issues:

- route rules spread across `ProtectedRoute`, `AdminRoute`, subscription hooks, admin hooks, and feature hooks
- support/admin/reception behavior is encoded procedurally in route guards

Refactor:

- create one access-resolution layer returning:
  - actor type
  - professional context
  - role capabilities
  - plan capabilities
  - feature overrides
- keep route guards thin and declarative

### Booking and public scheduling

Current issues:

- `PublicBooking.tsx` owns fetching, flow state, payment rules, waitlist, review flow, upsell integration, and UI

Refactor:

- split into:
  - `PublicBookingPage`
  - `usePublicBookingFlow`
  - `usePublicBookingData`
  - `usePublicBookingSubmission`
  - presentational step components
- extract shared booking DTOs and RPC response types

### WhatsApp and automations

Current issues:

- page layer and hooks are too close to backend event logic
- limited separation between transport state and automation business rules

Refactor:

- isolate API layer for instances, automations, logs, and triggers
- keep UI hooks focused on cache and mutation orchestration only

### Settings

Current issues:

- `Settings.tsx` is effectively a multi-domain backoffice inside one page

Refactor:

- split into route-level settings sections:
  - branding
  - booking
  - payments
  - integrations
  - team
  - feature access

### Reports and analytics

Current issues:

- reporting logic is computed inline in page components
- bundle pressure is high

Refactor:

- move data shaping into typed domain selectors
- lazy-load report-heavy visualizations
- unify PDF/export strategy to avoid mixed static and dynamic import behavior

## Route Refactor Proposal

Replace the single route registry with domain route modules:

- `src/app/router/publicRoutes.tsx`
- `src/app/router/professionalRoutes.tsx`
- `src/app/router/adminRoutes.tsx`
- `src/app/router/courseRoutes.tsx`

Then compose them in a small app router shell.

## Priority Execution Order

1. Extract route modules from `App.tsx`.
2. Centralize access resolution into one domain service.
3. Split `PublicBooking.tsx`.
4. Split `Settings.tsx`.
5. Move admin data access into typed domain adapters.
6. Reduce `any` usage in business-critical hooks first.

## What Not To Do

- Do not start by moving files mechanically without defining domain ownership.
- Do not create generic `services/` dumping grounds.
- Do not refactor pages before first extracting the capability model for auth/plan/feature gating.

## Practical Success Criteria

- each route belongs to one domain module
- each large page becomes a container plus smaller feature components
- hooks stop mixing transport, entitlement logic, and rendering concerns
- capability checks resolve from one source instead of multiple competing hooks
- TypeScript errors and `any` usage fall first in critical business domains

Overall assessment: **the frontend is deliverable today, but it needs domain boundaries before further product growth turns maintenance cost into a recurring drag.**
