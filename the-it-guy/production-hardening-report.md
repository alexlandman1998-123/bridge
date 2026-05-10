# Production Hardening Report (Phase 4)

## Scope
This pass focused on reliability hardening without redesigning UX or adding new product modules.

## 1. Auth Provider / Session Orchestration

Implemented central auth/session provider:
- `src/context/AuthSessionContext.jsx`

Provider now owns:
- current session / user
- auth loading state
- auth bootstrap error state
- retry auth bootstrap
- logout
- dev-auth role bridge (existing local bypass support)

Integrated into app shell:
- `App` now wraps route tree with `AuthSessionProvider`
- `AppRoutes` consumes `useAuthSession()` as auth source of truth for route gating and auth redirects

## 2. Protected Route Hardening

### Centralized checks retained + strengthened
- `AuthGate` continues as main protected-shell guard and now runs under centralized auth provider.

### Added token route guard
- `src/components/routing/TokenRouteGate.jsx`
- Applied to:
  - `/external/:accessToken`
  - `/client/:token` and major client/seller token route variants
  - `/snapshot/:token`
  - `/status/:token`
  - `/agent/invite/:token`

Behavior:
- rejects obviously malformed/missing tokens early
- prevents blank route rendering for broken token URLs

### Auth-only route behavior
- `/auth` now relies on centralized `session` from `useAuthSession`
- pending invite redirect continuation preserved (`itg:pending-org-invite-token`)

## 3. Permission Gate System

Added reusable capability helper:
- `src/lib/permissionGate.js`

Capabilities included:
- `view_developments`, `create_developments`, `edit_developments`
- `view_transactions`, `create_transactions`
- `edit_main_transaction_stage`, `edit_finance_lane`, `edit_attorney_lane`
- `upload_documents`, `request_documents`, `approve_documents`
- `comment_shared`, `comment_internal`
- `view_reports`, `export_reports`
- `manage_users`, `manage_organisation_settings`

Added reusable UI gate:
- `src/components/PermissionGate.jsx`

Integrated in key route paths:
- Reports route wrapped with `PermissionGate capability="view_reports"`
- Settings organisation route wrapped with `manage_organisation_settings`
- Settings users route wrapped with `manage_users`

## 4. Dashboard-safe Data Guards

Added/retained safe fallbacks instead of crash/loop behavior:
- Agent dashboard now shows explicit **Organisation Setup Pending** state with setup CTAs when org context is missing.
- Attorney dashboard now shows **Firm Setup Pending** state with actionable links (instead of hard trap).

Files:
- `src/pages/Dashboard.jsx`
- `src/pages/AttorneyDashboardPage.jsx`

## 5. Error Boundary Coverage

Added reusable boundary:
- `src/components/AppErrorBoundary.jsx`

Applied to:
- main protected app shell
- dashboard shell
- transaction workspace routes (`/transactions/:transactionId`, `/units/:unitId`)
- documents module route
- reports route
- external/client/snapshot/status token routes

Boundary UX includes:
- clear message
- retry button
- safe navigation to dashboard
- optional stack/debug details only in dev

## 6. Loading/Recovery Consistency

Hardening updates:
- centralized auth bootstrap + retry via provider
- existing auth/onboarding loading timeouts preserved
- token routes now fail fast on malformed token
- invite onboarding now preserves token and recovers through auth redirect path

## 7. Activity / Audit Logging Foundation

Added lightweight audit foundation:
- `src/lib/activityAudit.js`

Captured events (implemented now):
- `session_restored_from_callback`
- `onboarding_completed`
- `invite_accepted`

Integrated in:
- `src/pages/AuthCallback.jsx`
- `src/pages/RoleModuleOnboarding.jsx`
- `src/pages/AgentInviteOnboarding.jsx`

Note:
- Core workflow event tracking already exists separately through transaction event mechanisms in `api.js` / workflow services.

## 8. Token Route Safety Notes

Hardened routing-level safety through `TokenRouteGate` and error boundaries.

Client/external/snapshot routes now:
- validate token presence/basic format before deep render
- avoid blank page on malformed path
- show recoverable fallback

Existing page-level token validation and data-scoping logic remains in each route page/service.

## 9. Environment Validation

Added runtime validation helper:
- `src/lib/envValidation.js`
- validation now accepts either `VITE_SUPABASE_ANON_KEY` or legacy `VITE_SUPABASE_KEY`

Added environment warning banner in dev:
- rendered by `EnvironmentValidationBanner` in `AppRoutes`
- explicitly reports missing required env vars

Updated `.env.example` with:
- core Supabase vars
- app base URL vars
- feature flag vars

## 10. Feature Flag Cleanup

Updated feature-flag source:
- `src/lib/featureFlags.js` now uses env-backed booleans

Added feature flags in env model:
- `VITE_FEATURE_INTELLIGENCE_BETA`
- `VITE_FEATURE_CLIENT_PORTAL_ALTERATIONS`
- `VITE_FEATURE_SERVICE_REVIEWS`
- `VITE_FEATURE_SNAPSHOT_LINKS`
- `VITE_FEATURE_ADVANCED_ORG_SETUP`
- `VITE_FEATURE_REPORTS_EXPORT`
- `VITE_FEATURE_WHATSAPP_AUTOMATION`
- `VITE_FEATURE_INVITE_ONBOARDING`

Integrated immediately for:
- invite onboarding route (`/agent/invite/:token`)
- snapshot route (`/snapshot/:token`)
- client alterations/review route fallback to token root when disabled

## Build / Lint / Validation

### Build
- `npm run build` -> PASS
- Existing warnings remain (pre-existing):
  - duplicate object key warning in `AgentListings.jsx`
  - CSS minify warning
  - large chunk warnings

### Lint
- `npm run lint` -> FAIL (pre-existing repo-wide lint debt)
- Current result: `230 problems (192 errors, 38 warnings)`
- These are largely pre-existing across many unrelated modules.

### Targeted lint for new/changed hardening files
- PASS for:
  - `src/context/AuthSessionContext.jsx`
  - `src/components/AppErrorBoundary.jsx`
  - `src/components/routing/TokenRouteGate.jsx`
  - `src/components/PermissionGate.jsx`
  - `src/lib/permissionGate.js`
  - `src/lib/envValidation.js`
  - `src/lib/featureFlags.js`
  - `src/lib/activityAudit.js`
  - updated `src/App.jsx`

## Manual Flow Tests

Not fully executed in this CLI-only pass (no interactive browser session was run here).

Areas requiring immediate manual verification in your environment:
- auth: signup/login/logout/refresh/expired session
- onboarding: incomplete recovery + revisit handling
- route protection: logged-out direct URL, wrong-role access
- token routes: valid/invalid client token, valid/invalid external token
- dashboards: no-org/no-data states per role

### Requested matrix status
- fresh signup: pending manual validation
- login: pending manual validation
- logout: pending manual validation
- refresh after login: pending manual validation
- expired session behavior: pending manual validation
- complete onboarding: pending manual validation
- revisit onboarding: pending manual validation
- incomplete onboarding recovery: pending manual validation
- direct dashboard URL while logged out: pending manual validation
- direct dashboard URL while logged in: pending manual validation
- wrong role route access: pending manual validation
- invite route: pending manual validation
- client token route: pending manual validation
- invalid client token route: pending manual validation
- external token route: pending manual validation
- invalid external token route: pending manual validation
- developer dashboard with no developments: pending manual validation
- agent dashboard with no listings: pending manual validation
- attorney dashboard with no files: pending manual validation
- bond dashboard with no applications: pending manual validation
- dashboard with assigned transactions: pending manual validation
- role access (expected pages): pending manual validation
- role access (restricted pages blocked): pending manual validation
- assigned-only isolation checks: pending manual validation

## Remaining Risks

1. Repo-wide lint debt is substantial and can hide regressions.
2. Token route safety is improved at routing level, but full data-exposure validation depends on page/service-level scoping still being correct.
3. Permission helper is integrated at route level for core admin/report paths; deeper action-level adoption is still needed across all modules.
4. Audit foundation currently logs to structured client-side store/console; server-side immutable audit stream should be a next step.
5. Some legacy bootstrap pathways in settings/onboarding services still exist and should continue to be constrained to post-dashboard usage.

## Recommended Phase 5

1. Full action-level capability adoption (replace ad-hoc checks in transaction/document actions).
2. Server-side audit/event sink with immutable write path.
3. Route-level integration tests (Playwright) for auth/token/error-boundary recovery paths.
4. Progressive lint-debt burn-down focusing first on hook-order and runtime safety errors.
5. Formal security review of client/external token scoping and data leakage surfaces.
