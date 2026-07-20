# Supabase Phase 6 — Transaction Creation and Seller Attorney Choice

## Outcome

Phase 6 has been implemented, verified, and ledger-recorded on the dedicated Supabase staging project `vaszuxjeoajeuhlcnzzf`.

- Target: staging only
- Production project `isdowlnollckzvltkasn`: not changed
- Planned migration versions: `202607180046` and `20260719194500`
- Staging ledger entries confirmed: 2 of 2
- Evidence files: 2 of 2
- Repository contract tests: 4 passed, 0 failed
- Full application manifest recorded on staging: 64 of 64
- Persistent staging fixtures created: none

Phase 6 completes the remaining manifest scope: idempotent MVP transaction creation and an enforced seller decision about the transferring attorney.

After this phase, every one of the 64 rows in `docs/supabase-phase-5-application-manifest.json` is present in the staging migration ledger.

## Atomic transaction creation

The objects declared by `202607180046_mvp_atomic_transaction_creation_phase2a.sql` were already live through the safer staging reconciliation migration `20260719193500_mvp_atomic_transaction_creation_reconciliation.sql`. The historical migration was therefore not replayed. Its canonical ledger version was recorded only after live catalogue, security, and rollback-only behaviour checks passed.

The live boundary now provides:

- 17 MVP transaction fact and commission-snapshot columns;
- an organisation-scoped creation idempotency index;
- RLS-protected participant requirements;
- private participant, document, and workflow seed helpers;
- an authenticated-only atomic transaction-creation RPC;
- fixed security-definer search paths;
- linked transaction, lead, accepted-offer, participant, document, and workflow updates in one transaction.

A rollback-only end-to-end smoke used an existing agency lead, listing, offer, and active organisation member. The first RPC call created a transaction and the second returned the same transaction with `existing = true`. Rollback restored the original row counts.

## Seller attorney decision

`20260719194500_seller_onboarding_preferred_transfer_attorney_acceptance.sql` is live and its trigger is enabled.

When seller onboarding moves to `completed`, the database now requires one of two explicit outcomes:

1. The seller accepts the configured, active, connected preferred transferring attorney.
2. The seller nominates another firm and provides its company name and email address.

Rollback-only checks confirmed:

- a missing preferred-attorney choice is rejected with `23514`;
- an unconnected preferred attorney is rejected with `23514`;
- a complete alternative-firm nomination is accepted;
- a synthetic connected preferred attorney creates an `awaiting_buyer` allocation;
- the allocation links both the preferred partner and partner organisation;
- the allocation records `agency_recommended` and `seller_onboarding_acceptance` audit metadata.

The trigger-only function is not directly executable by anonymous or authenticated users and uses a fixed `public, pg_temp` search path.

## Security hardening

The canonical transaction migrations now explicitly revoke direct execution of internal security-definer seed helpers. Direct anonymous access to `transaction_participant_requirements` was removed; authenticated access is select-only and remains filtered by its active-organisation-member RLS policy.

The seller-onboarding trigger function likewise has all direct public, anonymous, and authenticated execution removed.

## Final persistent staging counts

| Object | Rows |
| --- | ---: |
| Transactions | 285 |
| Offers | 2 |
| Transaction participant requirements | 0 |
| Seller onboarding records | 28 |
| Preferred partners | 0 |
| Private-listing role players | 0 |

## Evidence

Evidence is stored under `migration-evidence/2026-07-20-staging-phase6/`:

- `202607180046.json` — live reconciled atomic-creation boundary and idempotency smoke
- `20260719194500.json` — seller attorney-choice trigger, validation, and allocation smoke

## Production status

Phase 6 has not been promoted to production. Production promotion remains a separate controlled phase requiring production recovery confirmation, exact-version staging evidence, per-migration production verification, and explicit production authorization.
