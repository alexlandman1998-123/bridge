# Arch9 | Operating Console

Internal admin dashboard for `admin.arch9.co.za`.

## Local setup

```bash
npm install
npm run dev
```

Create a local `.env` file with the same Supabase frontend values used by the main Arch9 app:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Never put a Supabase service-role key in this app. Browser apps must only use the anon key.

## Vercel setup

Create a separate Vercel project and point it at this folder:

```txt
Root Directory: apps/admin
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Add the custom domain to that Vercel project:

```txt
admin.arch9.co.za
```

Required Vercel environment variables:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Active shell

The current shell is intentionally small:

```txt
Dashboard
Support
Search
Settings
```

Dashboard and support data should come from Supabase RPC contracts:

```txt
arch9_admin_dashboard_snapshot
arch9_admin_support_snapshot
```

Dashboard V1 includes the operating KPI strip, revenue path, support summary, pipeline table, registered-this-month table, and attention queue.
Support V1 includes urgent, stalled, and missing-revenue lanes plus a filterable work queue.
Phase 6 adds dashboard KPI drilldowns and selectable support item detail.
Phase 7 adds a read-only real-data QA script at `scripts/admin-portal-phase7-real-data-qa.mjs`.
Phase 8 cut over production to the rebuilt Operating Console on `admin.arch9.co.za`.

## Access levels

The admin app uses two access levels:

```txt
executive
customer_support
```

Recommended Supabase user metadata:

```json
{ "role": "executive" }
```

or

```json
{ "role": "customer_support" }
```

Executive level can access Dashboard, Support, Search, and Settings.
Customer support level can access Support, Search, and Settings.

Roles are read from Supabase app metadata, user metadata, and common profile fields. Legacy internal roles still map into these two levels so existing staff access continues to work.
