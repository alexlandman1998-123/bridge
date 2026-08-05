# Commission Allocation Phase 7: Close-Out Enforcement

Phase 7 prevents a transaction from being moved into a terminal close-out state while canonical commission allocations are incomplete.

## What This Adds

- `commission_closeout_events` records blocked close-out attempts, clean close-outs, and admin overrides.
- `transaction_commission_closeout_readiness_v1` gives finance and operations a transaction-level readiness summary.
- `bridge_validate_transaction_commission_closeout(...)` returns a structured readiness decision without changing the transaction.
- `bridge_closeout_transaction_with_commission_check(...)` performs a controlled close-out and records the result.
- `trg_transactions_commission_closeout_enforcement` blocks direct updates to close-out transaction states when allocations are missing or unresolved.

## Close-Out Rule

A transaction can only close out when:

- It has at least one active canonical commission allocation.
- Every active allocation is resolved as `paid` or `waived`.
- No active allocation remains `projected`, `pending_approval`, `approved`, `due`, or `disputed`.

The close-out state detector treats these transaction stage/lifecycle values as terminal:

- `registered`
- `registration`
- `post_registration`
- `completed`
- `complete`
- `closed`
- `settled`
- `archived`

## Admin Override

Admins can use `bridge_closeout_transaction_with_commission_check(...)` with `p_override = true` and an override reason. The override still records unresolved allocation counts and amount in `commission_closeout_events`, so finance can review exceptions after close-out.

Direct table updates do not get an override path. They are blocked by the trigger unless the transaction is already commission-ready.

## Operational Flow

1. Conversion creates or applies canonical allocations.
2. Finance reviews allocations through Phase 6.
3. Allocations are marked `paid` or `waived`.
4. Operations closes the transaction using the close-out RPC.
5. If finance is incomplete, the RPC returns `commission_closeout_blocked` or `commission_allocations_missing`.

This keeps transaction completion from quietly bypassing referral, listing, sales, and partner commission accounting.
