# Admin Portal Phase 6 Drilldowns

Date: 2026-08-05

## Purpose

Phase 6 makes the portal auditable from the top-level numbers. The operator should be able to click a KPI or operational queue item and immediately see the records behind it.

## Dashboard Drilldowns

The dashboard KPI strip now opens a focused drilldown panel for:

- active organisations
- active agents
- active listings
- seller and buyer signed pipeline
- pipeline revenue
- registered revenue this month
- registered transactions this month
- stalled transactions

The Revenue Path also drives the same drilldown panel for signed pipeline, registered, and missing-revenue views.

## Support Drilldowns

Support V1 now includes item-level selection:

- lane items are clickable
- work queue rows are selectable
- the selected item exposes type, priority, status, organisation, owner, source, last activity, and next action
- support KPI cards switch the queue into the matching filter

## Data Contract

`arch9_admin_dashboard_snapshot` now returns:

- `drilldowns.activeOrganisations`
- `drilldowns.activeAgents`
- `drilldowns.activeListings`

Pipeline, registered, stalled, and support drilldowns reuse the existing `pipeline`, `registered`, `attention`, and `support.queue` arrays.

## Verification

Expected verification:

```bash
npm run build
```

Database verification still requires applying the Supabase migration in an environment with Supabase CLI or `psql` access.
