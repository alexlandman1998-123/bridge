# Admin Portal Phase 5 Support V1

Date: 2026-08-05

## Purpose

Phase 5 turns the Support page into a work queue for operational support, not just a count of open tickets.

Support V1 is intended to answer:

- what is urgent
- what is stalled
- which signed or registered transactions are missing Arch9 revenue values
- what needs action next
- who or what the support item belongs to

## Support V1 Sections

The support view now includes:

- KPI strip for open tickets, urgent items, stalled transactions, and revenue gaps
- urgent lane
- stalled transaction lane
- missing revenue lane
- queue filter segmented control
- filterable work queue table

The queue can filter by:

- all
- urgent
- tickets
- stalled
- revenue gaps

## Data Contract

Support V1 consumes:

- `arch9_admin_support_snapshot`
- dashboard `missing_revenue` warnings as a fallback until the support RPC is deployed everywhere

The support RPC now emits `missing_revenue` work items when a seller/buyer signed pipeline transaction or registered transaction has no Arch9 operating revenue field.

Support summary includes:

- `openTickets`
- `urgentTickets`
- `missingRevenueItems`
- `stalledTransactions`
- `totalItems`

## Verification

The Vite production build passes:

```bash
npm run build
```

A static support-contract check confirms:

- `missingRevenueItems`
- `missing_revenue`
- `signed_pipeline_missing_revenue`
- `arch9_admin_support_snapshot`

Browser automation could not be run from this shell because `agent-browser` is not installed.
