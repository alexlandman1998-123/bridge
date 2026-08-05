# Admin Portal Phase 8 Production Cutover

Date: 2026-08-05

## Purpose

Phase 8 cuts the rebuilt admin portal over to production after the Phase 7 blockers are cleared.

## Database Cutover

Applied only:

```txt
supabase/migrations/202608050009_admin_portal_data_contract_v1.sql
```

Method:

```bash
npx --yes supabase@2.109.1 db query --linked --file supabase/migrations/202608050009_admin_portal_data_contract_v1.sql --output-format json
```

Then recorded the migration ledger:

```bash
npx --yes supabase@2.109.1 migration repair --linked --status applied 202608050009
```

Verification:

- `arch9_admin_dashboard_snapshot` exists
- `arch9_admin_support_snapshot` exists
- anonymous dashboard RPC calls are blocked with `admin dashboard access required`
- anonymous support RPC calls are blocked with `admin support access required`
- `202608050009` is recorded in the remote migration ledger
- `202608050010` remains unapplied

## Vercel Cutover

Updated the `bridge-admin` Vercel project Node.js setting from `24.x` to `22.x`.

Production deployment:

```txt
https://bridge-admin-6v3gy6f7h-alexs-projects-f5496a21.vercel.app
```

Custom domain:

```txt
https://admin.arch9.co.za/
```

Production HTML verification:

- starts with `<!doctype html>`
- title is `Arch9 | Operating Console`
- old `git` prefix is gone
- served bundle references the rebuilt admin assets

## Browser Smoke

Signed-in browser smoke on `https://admin.arch9.co.za/`:

- new Operating Console shell rendered
- old Executive Command Centre shell no longer rendered
- Dashboard, Support, Search, and Settings navigation rendered
- dashboard RPC returned generated timestamp and range
- active organisations returned `28`
- Support page rendered queue filters and revenue-gap controls
- dashboard drilldown opened for active organisations
- no captured console errors

## Residual Risks

- The local diagnostic service-role credential is still stale, so script-based table sampling remains blocked with `PGRST301`.
- Active agents, listings, pipeline, registered revenue, and support counts returned zero in the first production smoke. That may be accurate under the V1 contract, but it needs a valid diagnostic credential or deeper business-data audit to confirm.
- The deployment used a temporary Vercel workspace to avoid the CLI double-root issue caused by the project's `rootDirectory: apps/admin`.

## Repeat Checks

```bash
node scripts/admin-portal-phase7-real-data-qa.mjs
```

Expected after cutover:

- RPC existence checks pass
- anonymous access checks pass
- service diagnostic check still fails until credentials are refreshed
