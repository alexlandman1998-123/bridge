# Commission Allocation Phase 4 Transaction Conversion Hook

## Purpose

Phase 4 makes transaction conversion the commission initialization boundary.
When an accepted-offer or lead-backed transaction is created, the database now
creates or normalizes the `transaction_commissions` snapshot, applies the active
commission structure, and links converted referrals to the transaction.

## Hook Behavior

`bridge_apply_transaction_conversion_commission_hook(...)` is idempotent. It can
be called by the trigger, by a conversion RPC, or manually by an authenticated
organisation member.

The hook:

- resolves the active commission structure using the Phase 3 resolver
- derives sale price, gross commission, split percentages, and split amounts
- inserts or fills missing fields on `transaction_commissions`
- invokes `bridge_apply_commission_structure_to_transaction(...)`
- links accepted/working referral records to the transaction
- syncs internal referrals through Phase 2 accounting

## Trigger Boundary

`trg_transactions_conversion_commission_hook` runs after transaction insert or
after updates to conversion, price, assignment, or commission snapshot fields.
It only applies when the transaction has an accepted offer, originating lead, or
explicit commission facts.

## Referral Handling

Phase 4 links converted referrals into `transaction_referral_links`.

Internal referrals are immediately synced into
`transaction_commission_allocations` by Phase 2 accounting. External referrals
are linked for later external referral accounting without creating payout rows
in this phase.

## Reporting

`transaction_conversion_commission_hook_v1` gives finance/admin screens a simple
read model showing conversion-linked commission snapshots and referral link
counts per transaction.
