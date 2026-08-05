# Admin Portal Phase 4 Dashboard V1

Date: 2026-08-05

## Purpose

Phase 4 turns the stripped admin shell into the first usable operating dashboard.

The dashboard is designed to answer:

- what is active
- what is signed and moving toward registration
- what revenue is already registered this month
- what is stalled
- what needs support attention

## Dashboard Sections

The V1 dashboard includes:

- status strip with generated time, selected range, warning count, and support queue count
- KPI strip for active organisations, active agents, active listings, pipeline revenue, registered revenue this month, seller + buyer signed count, registrations this month, and stalled transactions
- revenue path from signed pipeline to registered revenue
- support-at-a-glance summary
- pipeline table
- registered-this-month table
- transactions requiring attention queue
- data warnings for missing RPCs, missing tables, or missing revenue values

## Data Source

Dashboard V1 consumes:

- `arch9_admin_dashboard_snapshot`
- `arch9_admin_support_snapshot`

The dashboard intentionally does not recreate business calculations in React.

## Revenue Handling

The UI shows `revenueMissing` rows explicitly. Missing revenue is counted in the revenue path and surfaced through warnings rather than being hidden inside totals.

## Verification

The Vite production build passes:

```bash
npm run build
```

The local dev server is available at:

```txt
http://127.0.0.1:5177/admin
```

Browser automation could not be run from this shell because `agent-browser` is not installed.

## Remaining Work

- Apply and dry-run the Phase 2 Supabase migration.
- Verify the dashboard against live/staging data.
- Confirm the canonical Arch9 revenue field.
- Add organisation, agent, listing, and transaction drilldowns in later phases.
