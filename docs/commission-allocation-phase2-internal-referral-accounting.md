# Commission Allocation Phase 2 Internal Referral Accounting

## Purpose

Phase 2 turns internal accepted referrals into canonical commission allocation
rows. It keeps the existing `lead_referrals` conversion flow intact, then
mirrors the internal referral entitlement into `transaction_referral_links` and
`transaction_commission_allocations`.

## Internal Referral Rule

An internal referral is eligible for accounting when:

- `lead_referrals.recipient_scope = internal`
- the referral is accepted, converted, commission due, or paid
- `converted_transaction_id` is present
- the transaction organisation matches the referral source organisation
- the target organisation is either null or the same organisation

External referrals stay out of Phase 2 and remain for the partner agreement
phase.

The migration adds `lead_referrals_internal_same_org_check` as `not valid`, so
new internal referral writes are constrained without blocking deployment on
historical data.

## Accounting Behaviour

`bridge_sync_internal_referral_accounting(...)` is the canonical sync primitive.
It:

- creates or reuses an active `transaction_referral_links` row
- creates or updates one internal referral allocation for the referring agent
- calculates the amount from the referral split and the available commission
  basis
- maps legacy referral commission status into canonical allocation status
- snapshots the referral terms used for the calculation

The sync is idempotent: the same referral and transaction pair updates the
existing allocation instead of creating duplicates.

## Automation

Two triggers call the sync function:

- `lead_referrals`: when internal referral conversion, split, or commission
  status changes
- `transaction_commissions`: when gross, agent, or agency commission snapshots
  change for a transaction with internal referrals

## Reporting

`internal_referral_commission_accounting_v1` gives finance and principal views
a clean read model for internal referral balances without forcing UI code to
join the canonical tables manually.
