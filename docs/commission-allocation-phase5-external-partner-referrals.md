# Commission Allocation Phase 5 External Partner Referrals

## Purpose

Phase 5 makes external Arch9 referrals payable only through connected partner
relationships. It extends the canonical commission ledger so a buyer/client
referred to another agency can convert into a transaction owned by the receiving
organisation, while the source organisation receives a protected referral
allocation.

## Partner Enforcement

`bridge_has_accepted_partner_relationship(...)` accepts either canonical
`organisation_partners` rows with `accepted` status or legacy
`partner_connections` rows with `connected` status.

`bridge_enforce_external_partner_referral(...)` prevents an
`external_arch9` referral from being accepted or converted unless:

- `target_organisation_id` is present
- source and target organisations are different
- the two organisations are connected partners

This keeps external commission-bearing referrals inside the Hotline partner
network.

## Accounting

`bridge_sync_external_partner_referral_accounting(...)` mirrors accepted and
converted external Arch9 referrals into `transaction_commission_allocations`.

The allocation is written against the receiving transaction organisation, with:

- `allocation_type = external_referral`
- `scope = partner`
- `participant_role = external_partner`
- `participant_organisation_id = source_organisation_id`
- `requires_approval = true`

The calculated amount follows the accepted referral agreement terms:
percentage of gross, agent, or agency commission, or a fixed amount.

## Conversion Hooks

Phase 5 syncs external partner referrals from three places:

- `lead_referrals` when status, conversion, split, or commission state changes
- `transaction_commissions` when transaction commission facts change
- `transactions` when a receiving organisation creates or updates a converted
  transaction linked to the referred lead/listing

## Reporting

`external_partner_referral_commission_accounting_v1` exposes the transaction,
referral, source partner, receiving partner, split, calculated amount, approval,
due, and paid state for finance/admin reporting.
