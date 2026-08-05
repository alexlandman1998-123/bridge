# Commission Allocation Phase 8: Reporting

Phase 8 turns the canonical commission ledger into finance-ready reporting contracts.

## What This Adds

- `commission_allocation_reporting_base_v1`: flattened allocation detail across transactions, referrals, structures, participants, status, aging, and reporting buckets.
- `commission_finance_summary_v1`: month/status/type/scope totals for finance dashboards.
- `commission_participant_earnings_v1`: participant-level earnings totals for listing, selling, and referral allocations.
- `commission_referral_reporting_v1`: internal and external referral commission reporting in one view.
- `commission_closeout_reporting_v1`: transaction close-out readiness with latest close-out event context.
- `commission_report_snapshots`: audited report snapshot/export requests.
- `bridge_commission_reporting_snapshot(...)`: permissioned JSON snapshot RPC for dashboard and export workflows.

## Reporting Buckets

Allocations are grouped into practical finance buckets:

- `needs_review`
- `approved_unpaid`
- `payable_due`
- `disputed`
- `paid`
- `waived`
- `projected`

Open allocations also receive aging buckets: `0_7`, `8_30`, `31_60`, `61_90`, and `90_plus`.

## Snapshot RPC

`bridge_commission_reporting_snapshot(...)` accepts:

- organisation id
- date range
- report type
- whether to include a bounded detail sample

It returns status totals, allocation type totals, aging totals, close-out readiness totals, and optional detail rows. Every call writes a `commission_report_snapshots` audit row so exports and dashboard snapshots can be traced back to an actor and filter set.

## Why This Matters

Finance can now answer these questions from canonical data:

- What is owed, paid, waived, disputed, or still awaiting approval?
- Which agents or partners earned each allocation?
- Which referrals created payable exposure?
- Which transactions are blocked from close-out by commission state?
- Which report/export snapshot was generated, by whom, and with which filters?
