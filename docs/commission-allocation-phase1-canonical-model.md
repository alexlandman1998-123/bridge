# Commission Allocation Phase 1 Canonical Model

## Purpose

Phase 1 introduces a canonical commission model without replacing the existing
`lead_referrals`, `referral_commission_events`, or `transaction_commissions`
surfaces. The new model separates referral intent from payable commission
entitlements.

## Source Layers

- `lead_referrals`: referral intent, source/target parties, agreement state,
  accepted terms, protection period, and conversion reference.
- `transaction_referral_links`: explicit bridge between accepted referrals and
  transactions.
- `commission_structures`: versioned agency-level commission structures.
- `commission_structure_rules`: reusable allocation rules grouped by structure,
  basis, and pool.
- `transaction_commission_allocations`: canonical payable entitlement rows for
  listing, selling, referral, agency, branch, and override allocations.

## Mapping

An accepted `lead_referrals` row should become a `transaction_referral_links`
row when a transaction is created or when finance/admin links it manually. The
link then drives one or more `transaction_commission_allocations` rows.

Recommended mapping:

- `lead_referrals.recipient_scope = internal` -> `internal_referral`
- `lead_referrals.recipient_scope = external_arch9` -> partner-scoped allocation
- `lead_referrals.referral_type = buyer_introduction` -> `buyer_introduction`
- `lead_referrals.referral_type = listing_collaboration` -> `listing_collaboration`
- all other external accepted referrals -> `external_referral`

The migration includes `referral_commission_allocation_mapping_v1` as a read
view for this bridge.

## Default Structure

The migration adds `bridge_create_default_commission_structure(org_id)`, which
creates an active default `Residential standard sale` structure with:

- listing agent: 40% of gross commission
- selling agent: 40% of gross commission
- agency share: 20% of gross commission

This is a seed helper, not automatic production data creation.

## Phase Boundary

Phase 1 only makes the model representable. Later phases should add:

- internal referral creation and auto-approval policy
- rule builder/admin UI
- transaction conversion hooks
- external partner gating
- finance approval and payout workflow
