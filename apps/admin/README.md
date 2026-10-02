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

Trusted Supabase app metadata (not user-editable user metadata):

```json
{ "role": "executive" }
```

or

```json
{ "role": "customer_support" }
```

Executive level can access Dashboard, Support, Search, and Settings.
Customer support level can access Support, Search, and Settings.

The database resolves internal access from trusted app metadata. User metadata and writable profile fields cannot grant internal access.

## Knowledge Factory setup

Executive Settings includes an organisation-scoped Knowledge Factory setup panel.
It reads report readiness, saves explicitly chosen caps in `controlled_uat`, and
validates the server-owned Basic or Full package query on the pinned v1 UAT
endpoint. It cannot grant report access, activate a pilot, or execute client reports.
Exact-package checks now return a conservative maximum: freshly validated
complexity plus the September 2026 v1 fee schedule at every selected list limit.
Basic reserves 11,050 field-fee credits; Full reserves 17,575. The literal query
fingerprint must match the reviewed envelope. Estimates are not stored as
validated billing evidence and cannot approve a product. Actual execution billing
remains separate, parsed from `extensions.billingCost`.
The API is hosted by the primary app at
`/api/admin/knowledge-factory/configuration`; both apps must be released before
this panel can be used in production. No new migration is required.

Confirm whether the supplier account is subscription (40 credits per cent) or
prepaid (30 credits per cent). Those conversions are illustrative supplier cost,
not the customer report price or an invoice. Cost checks request
`GraphQL-Cost: validate` and `GraphQL-Billing: report`; missing billing evidence
does not become a free quote. Live UAT evidence for the exact property/package
must be checked before releasing paid reports.

The separately approved 1 October diagnostic is shown only to the named executive
for Home Seekers. `/api/admin/knowledge-factory/uat-report-test` permits one fixed
Basic v1 UAT report for property 383723, before 2 October 00:00 UTC. Its permanent
audit primary-key claim blocks repeat attempts across deployments, including after
timeouts or failed preflights. It does not grant client access or validate customer
pricing. Only billing metadata is saved; report data stays in the private page's
memory. The 12,000-credit preflight budget is not a supplier-enforced billing cap.
