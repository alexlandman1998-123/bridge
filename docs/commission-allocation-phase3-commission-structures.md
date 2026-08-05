# Commission Allocation Phase 3 Commission Structures

## Purpose

Phase 3 makes commission structures executable. Phase 1 made the canonical
tables possible, Phase 2 made internal referrals account into the ledger, and
Phase 3 lets agency-defined structures resolve into transaction allocation rows.

## Compatibility Layer

The existing settings UI uses `organisation_commission_structures` and
`organisation_user_commission_profiles`. This phase keeps those tables as the
admin-facing compatibility surface and mirrors saved structures into:

- `commission_structures`
- `commission_structure_rules`

That means current settings screens can continue to work while the finance
ledger reads from the canonical model.

## Rule Engine

`bridge_apply_commission_structure_to_transaction(...)` resolves the active
structure for a transaction, reads its rules, and writes generated rows to
`transaction_commission_allocations`.

Generated allocations cover non-referral commission functions such as:

- selling agent commission
- agency share
- listing agent commission, when a structure defines it
- branch, principal, manager, and custom allocation rules

Internal referral allocations remain owned by Phase 2, but they can now carry
the resolved structure/rule reference when matching rules exist.

## Resolution Order

`bridge_resolve_commission_structure(...)` resolves structures in this order:

- active user/profile assignment
- transaction commission snapshot structure
- active default matching transaction/property/mandate type
- active organisation default

## Validation

`bridge_validate_commission_structure(...)` prevents activation of structures
with empty rule sets or percentage pools above 100%.

`commission_structure_validation_v1` provides a read model for admin screens and
release checks.

## Reporting

`transaction_commission_structure_allocations_v1` exposes structure-generated
allocation rows for finance dashboards without including referral allocations.
