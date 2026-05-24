# Bridge Phase 7 Production Operations

This document captures the production hardening, observability, deployment safety, recovery, security, and scale-readiness rules introduced in Phase 7.

## Production Configuration

Production must run with these unsafe flags disabled:

- `VITE_ENABLE_DEMO_MODE=false`
- `VITE_ENABLE_LOCAL_FALLBACKS=false`
- `VITE_ENABLE_DEV_AUTH_BYPASS=false`
- `VITE_ENABLE_MOCK_DATA=false`
- `VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS=false`

The runtime production validation layer must fail auth boot when unsafe production flags are enabled or required Supabase variables are missing. Production also requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Observability Model

Bridge records operational telemetry through central observability services:

- Auth metrics: login/session boot, auth boot failures, logout and timeout logout.
- Onboarding metrics: started, resumed, completed, failed, recovered.
- Workspace metrics: workspace creation, invites, memberships, access requests.
- Permission metrics: access denied, invalid route attempts, blocked membership states.
- System metrics: route transition time, auth boot time, API/mutation latency, slow operations.

Telemetry metadata must be redacted before persistence. Sensitive values such as tokens, passwords, emails, phone numbers, cookies, keys, and session data must not be stored in telemetry metadata.

## Error Tracking

Errors are reported through the central error tracker with:

- category
- severity
- user id when available
- workspace id when available
- route
- operation
- environment
- redacted metadata

Users must see friendly messages only. Raw Supabase or internal errors are for internal logs and admin diagnostics.

## Auditability

Production audit logging should track:

- login/logout/timeout logout
- workspace creation and settings changes
- invite sent and accepted
- access request approval/rejection
- role and membership status changes
- exports
- deletes
- document approvals/rejections
- transaction stage changes
- permission denials and suspicious access

Audit logs are append-only operational records. They are not a replacement for permission checks or RLS.

## Platform Admin Operations Center

The Platform Admin Operations Center is restricted to `platform_admin` users and should be used for:

- deployment health checks
- runtime configuration checks
- integrity summaries
- recent telemetry events
- user/workspace/transaction diagnostics
- recovery recommendations
- audit and security event review

It must never be exposed to ordinary workspace users or clients.

## Support Access And Impersonation

Support impersonation is not enabled by default. If added later, it must satisfy:

- platform admin only
- explicit start/stop action
- temporary session
- visible "Support Access Active" UI
- no password access
- no silent impersonation
- full audit log of actor, target user, start time, end time, and actions
- no cross-tenant privilege escalation

## Recovery Procedures

### Auth Failures

1. Check Supabase availability and project status.
2. Check required production env vars.
3. Review auth boot errors in `error_events`.
4. Review security audit events for invalid sessions or repeated failures.
5. Ask affected users to retry login only after configuration is confirmed healthy.

### Onboarding Failures

1. Run user diagnostics in the Operations Center.
2. Validate profile, signup intent, onboarding state, workspace, and membership.
3. If records are missing, use recovery recommendations.
4. Do not mark onboarding complete manually unless validation contracts pass.

### Workspace Failures

1. Run workspace diagnostics.
2. Confirm owner/principal membership exists.
3. Confirm required default branch/team/department exists.
4. Confirm membership statuses and workspace type.
5. Repair through controlled admin action only; do not silently create production records.

### Transaction Failures

1. Run transaction diagnostics.
2. Confirm workspace, participants, stage, documents, and assignments.
3. Block invalid stage transitions until required records exist.
4. Log any manual correction in audit records.

### Failed Deployment

1. Run deployment health check.
2. Confirm unsafe flags are false.
3. Confirm migrations are applied.
4. Confirm critical tables are queryable.
5. Roll back deployment if auth, onboarding, permission, or workspace boot cannot complete.

## Deployment Safety Checklist

Before production deploy:

- Required env vars exist.
- Unsafe flags are false.
- Supabase migrations are applied.
- `profiles`, `organisation_users`, `organisations`, `onboarding_states`, and audit tables are queryable.
- Permission registry loads.
- Auth boot and workspace boot compile.
- Route guards compile.
- Production validation passes.
- Platform admin diagnostics are restricted.

## Rate Limiting And Abuse Signals

Bridge should track and eventually enforce rate limits for:

- login attempts
- signup attempts
- invite acceptance
- invite creation
- exports
- bulk operations

Repeated permission denial, invalid invite tokens, cross-workspace attempts, and abnormal export activity should be logged as security events.

## Data Retention Strategy

Suggested retention windows:

- Security audit logs: 7 years or legal/compliance requirement.
- Transaction audit logs: 7 years or transaction/legal requirement.
- Error events: 180 days, longer for unresolved incidents.
- Telemetry events: 90 days.
- Performance metrics: 90 days aggregated, 30 days raw.
- Onboarding events: 1 year.
- Expired/revoked invites: 180 days after expiry/revocation unless linked to an incident.
- Abandoned signup intents/onboarding drafts: 90 days after last update.

Do not auto-delete production business records without explicit retention approval.

## Environment Separation

### Local Development

- Uses local or sandbox Supabase projects.
- Demo/dev flags may be enabled explicitly.
- Mock data may be enabled explicitly.
- No production credentials.

### Demo / Staging

- Separate Supabase project.
- Seeded demo data allowed.
- Demo flags may be enabled only for controlled demonstrations.
- Production customer data must not be copied without anonymisation.

### Production

- No demo mode.
- No mock data.
- No local fallbacks.
- No dev auth bypass.
- No disabled role restrictions.
- Production Supabase project and production domain only.

## Scale Readiness Review

### Database

Priority risks:

- Missing indexes on `user_id`, `workspace_id`, `organisation_id`, `status`, `token`, and assignment columns.
- Heavy client-side filtering after broad queries.
- Permission checks that require repeated membership lookups.
- Transaction/reporting joins without workspace-first filters.

Recommendations:

- Ensure all workspace-scoped tables have workspace indexes.
- Use workspace-first queries.
- Add composite indexes for common filters such as `(workspace_id, status)` and `(assigned_user_id, status)`.
- Prefer server-side pagination for leads, listings, transactions, matters, applications, and audit logs.

### Frontend

Priority risks:

- Large tables rendering without pagination or virtualisation.
- Expensive dashboards loading all workspace records at once.
- Repeated auth/workspace boot queries on route changes.

Recommendations:

- Paginate operational tables.
- Measure dashboard load time per route.
- Cache permission resolution per auth boot state.
- Avoid frontend-only filtering for scoped data.

### Reporting

Priority risks:

- Long-running exports in the browser.
- Large PDF generation blocking UI.
- Cross-workspace leakage through broad report queries.

Recommendations:

- Move heavy exports server-side.
- Scope exports by permission resolver and RLS.
- Log every export request and completion.

## Security Review Checklist

Critical:

- Unsafe production flags cannot boot.
- Pending/suspended/removed memberships cannot access dashboards.
- No localStorage permission authority.
- No cross-workspace data queries.
- Invite tokens expire and cannot be reused.

High:

- Exports require explicit permissions and audit logs.
- Settings and role changes require explicit permissions.
- Platform admin routes require `platform_admin`.
- Raw database errors are not shown to users.

Medium:

- Telemetry redacts sensitive fields.
- Repeated denied access is tracked.
- Client portal access is token/client-link scoped.

Low:

- UI hiding mirrors permissions for usability.
- Support guidance explains recovery paths in plain language.

## Phase 8 Candidates

- Full server-side rate limiting.
- Dedicated support impersonation service.
- External error tracking provider integration.
- Alerting thresholds for deployment failures and security spikes.
- Scheduled integrity scans.
- Background export workers.
- Aggregated operational reporting dashboards.
