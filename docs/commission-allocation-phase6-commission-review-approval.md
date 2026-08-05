# Commission Allocation Phase 6 Commission Review Approval

## Purpose

Phase 6 adds the finance control layer for canonical commission allocations.
Earlier phases create projected and referral allocations; this phase lets
finance/admin users review, approve, mark due, mark paid, waive, dispute, and
reopen those allocation rows with an audit trail.

## Review Event Ledger

`commission_allocation_review_events` records every controlled review action
against a `transaction_commission_allocations` row.

Each event captures:

- allocation, transaction, organisation, and source referral
- action and status transition
- previous and new approved amount
- calculated amount snapshot
- reason, payment reference, actor, and metadata

## Review RPC

`bridge_review_commission_allocation(...)` is the controlled lifecycle API.

Supported actions:

- `submit` / `submit_for_review`
- `approve`
- `mark_due` / `due`
- `mark_paid` / `paid`
- `waive`
- `dispute`
- `reopen`

Organisation admins can approve, due, pay, waive, and reopen allocations.
Participants or active members can raise a dispute on their own visible
allocation. Waive, dispute, and reopen require a reason.

## Source Sync

`bridge_sync_commission_allocation_review_sources(...)` keeps compatibility
state aligned after review actions:

- source `lead_referrals.commission_status`
- referral due/paid timestamps and payment reference
- transaction-level `transaction_commissions.status`

The canonical allocation row remains the source of truth.

## Reporting

`commission_allocation_review_queue_v1` exposes allocation rows that need
finance attention, plus latest review action details.

`commission_allocation_review_summary_v1` aggregates pending, approved, due,
paid, waived, disputed, calculated, approved, due, and paid totals by
organisation.
