# Supabase Phase 6 Commercial and Transaction Network Report

Generated: 2026-07-14
Branch: `codex/db-phase0-reconciliation`
Project: `isdowlnollckzvltkasn`

## Outcome

Phase 6 is deployed, verified, recorded in the Supabase migration ledger, committed, and pushed. The batch delivered the commercial landlord workspace and role formalisation, shared transaction comment metadata, transaction-participant role normalisation, canonical invite operations and synchronization, partner-portal persistence, invitation lifecycle operations, and acceptance reconciliation.

The migration audit moved from 326 matched / 35 local-only rows to 343 matched / 19 local-only rows, with no split or remote-only versions.

## Applied migrations

The exact historical migrations were applied for:

- `202606160002`, `202606210004`
- `202606260002`, `202606260003`, `202606260004`
- `202606290015`
- `202606300003`, `202606300004`, `202606300006`, `202606300007`, `202606300008`
- `202607010002`
- `202607080006`

The forward reconciliation `202607140023` supplied the safe outcome for three historical migrations that were not replayed unchanged:

- `202606290010` repeated broad commercial grants and was redundant after the token-scoped commercial workspace migration.
- `202607050007` and `202607080002` had conflicting invitation-delete behavior; the reconciliation preserves sender-or-organisation-admin deletion while blocking accepted invitations.
- `202607080002` would also have overwritten newer membership helpers that recognize accepted memberships and JWT email claims. Those newer helpers were preserved.

All 17 outcome versions, including the forward reconciliation, were then recorded as applied.

## Security reconciliation

- Canonical invite administration now delegates to the hardened Phase 5 `bridge_is_platform_admin()` boundary and does not trust editable profile or user metadata.
- Anonymous users may look up a partner portal by its opaque token but cannot activate it.
- Direct writes to all seven partner-portal persistence tables are revoked from `PUBLIC` and `anon`; authenticated access remains protected by RLS.
- Invitation resend, audit, action, expiry, deletion, portal activation, canonical health, and canonical reconciliation operations require authentication.
- Acceptance repair functions are service-role only.
- Internal synchronization trigger functions are not directly executable by API roles.

## Verification evidence

The complete 3,628-line sequence passed against the linked database inside one rollback-only transaction before deployment. Post-deployment verification confirmed:

- 4 commercial landlord workspace tables and 9 associated policies
- 7 transaction partner-portal tables and 8 associated policies
- RLS enabled on every new commercial and partner-portal table
- 12 shared transaction-comment metadata columns
- all 4 expected commercial/invite/participant synchronization triggers
- anonymous portal activation denied and authenticated activation allowed
- authenticated repair execution denied and service-role repair execution allowed
- 940 transaction participants with 0 role-normalisation mismatches
- invalid partner-portal tokens return `not_found`
- canonical reconciliation dry-run found 0 partner, buyer, or seller synchronization gaps

Canonical invite health is operational but reports two existing stale pending client invites and one duplicate pending invite. These are operational cleanup warnings, not schema or synchronization failures; Phase 6 did not automatically expire or delete user invitations.

## Automated checks

- Supabase migration safety check: passed with 362 unique migration files
- Commercial/transaction reconciliation static guard: passed
- Commercial MVP: passed
- Commercial role formalisation: passed
- Unified invites: passed
- Bond partner portal service: passed
- Invite acceptance reconciliation: passed
- Full rollback-only SQL verification: passed
- Live post-deployment SQL verification: passed

## Remaining migration backlog

The remaining 19 pure local-only versions are intentionally outside Phase 6:

- developer/referral: 8
- notification automation: 6
- bond/finance: 2
- workspace platform: 1
- in-progress legal-document work: 2

There are no split ledger rows and no remote-only rows.
