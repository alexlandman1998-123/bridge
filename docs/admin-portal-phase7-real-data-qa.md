# Admin Portal Phase 7 Real Data QA

Date: 2026-08-05

## Purpose

Phase 7 checks the rebuilt admin portal against the live `admin.arch9.co.za` surface and the configured production Supabase project.

## Live Portal Findings

The live domain currently serves the old Executive Command Centre, not the stripped Operating Console from Phases 3-6.

Observed on `https://admin.arch9.co.za/`:

- old shell is present: Dashboard, Growth, Revenue, Ecosystem, Platform Health, Organisations, Legal Templates, Roleplayers, Users, Transactions, Service Desk
- rebuilt shell is not present: Operating Dashboard, Support, Search, Settings
- active organisations shows `28`
- active users, transactions in progress, registrations this month, monthly revenue, and pipeline value show waiting/no matching records
- browser console showed no captured errors during the inspection
- live HTML still contains a stray `git` prefix before `<!doctype html>`

The stray prefix has been fixed locally in `apps/admin/index.html`, but production still needs a deployment.

## Supabase RPC Findings

The Phase 2 admin RPCs are not present in the live Supabase schema cache.

Read-only RPC probes returned:

- `arch9_admin_dashboard_snapshot`: `404 PGRST202`
- `arch9_admin_support_snapshot`: `404 PGRST202`

The diagnostic service-role credential available in local env files is not accepted by the configured Supabase project:

- service-token probes returned `401 PGRST301`
- direct read-only table sampling could not run

## Blockers

Real-data QA cannot be completed until:

- `supabase/migrations/202608050009_admin_portal_data_contract_v1.sql` is applied to the live Supabase project
- the live `admin.arch9.co.za` deployment is updated to the rebuilt `apps/admin` bundle
- the stale local diagnostic service-role credential is refreshed or replaced with a valid read-only QA path

## Repeatable QA Script

Added:

```bash
node scripts/admin-portal-phase7-real-data-qa.mjs
```

The script:

- loads local Supabase env files without printing secrets
- checks whether the dashboard/support RPCs exist
- verifies whether anonymous access is blocked after deployment
- verifies whether the diagnostic service JWT is accepted
- samples real tables read-only when a valid diagnostic credential exists
- computes the same V1 operating counts used by the dashboard contract

## Local Fixes From QA

Fixed local admin HTML:

- removed stray `git` prefix
- updated page title to `Arch9 | Operating Console`

## Verification

Local production build passes:

```bash
npm run build
```

The built local HTML now starts with `<!doctype html>` and uses the `Arch9 | Operating Console` title.
