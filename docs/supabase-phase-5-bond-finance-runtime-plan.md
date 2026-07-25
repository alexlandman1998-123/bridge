# Supabase Phase 5 Bond Finance Runtime Plan

Generated: 2026-07-25

## Scope

Phase 5 isolates the bond finance runtime migrations into a dedicated stream. This phase does not apply SQL, repair the migration ledger, or retire the Phase 0 broad-push freeze.

The target stream is:

- `bond_finance_runtime`

## Implemented

- Verified that the Phase 5 application manifest groups the bond finance rows under `bond_finance_runtime`.
- Verified that staging and production runners produce the same two-row execution plan.
- Confirmed that both rows are `none_live`, so they are candidates for original single-file application after staging dependency checks.

## Bond Finance Runtime Plan

| Version | Depends On | Action | Evidence | File |
| --- | --- | --- | --- | --- |
| `202607220013` | `stream preflight` | `apply_original_after_dependency_check` | `none_live` 0/4 | `202607220013_bond_application_consent_and_finance_document_audit.sql` |
| `202607220014` | `202607220013` | `apply_original_after_dependency_check` | `none_live` 0/8 | `202607220014_bond_partner_referral_terms_and_ledger.sql` |

## Expected Runtime Shape

`202607220013` introduces the consent and finance-document audit foundation:

- buyer consent before bond-originator contact or finance sharing
- bond finance document access audit trail
- organisation and buyer scoped RLS policies

`202607220014` introduces partner referral and commission accounting:

- bond partner referral terms
- application-level referral term snapshots
- referral commission ledger
- originator, agency, and beneficiary scoped RLS policies

## Execution Rules

These rows can only be applied in order:

1. Run staging preflight against `202607220013`.
2. Apply only `202607220013` to staging.
3. Verify catalog, RLS, and behavior checks for consent and audit access.
4. Record staging evidence for `202607220013`.
5. Repeat the same process for `202607220014`, after confirming `202607220013` is ledger-recorded in staging.
6. Production can only follow after reviewed staging evidence exists for the exact version being applied.

## Required Smoke Evidence

Before production, staging evidence should prove:

- a buyer can create or update consent only for their own transaction
- active organisation members can read the relevant consent and finance audit rows
- unrelated users cannot read bond consent, audit, referral terms, snapshots, or commission ledger rows
- an originator admin can propose referral terms
- an agency admin can accept or reject referral terms
- accepted referral terms enforce the single-accepted-term constraint per originator/agency pair
- commission ledger visibility follows originator, agency, and beneficiary rules

## Current Blockers

Live mutation remains blocked by the repository gates:

- No staging target environment is configured.
- No reviewed staging evidence exists for `202607220013` or `202607220014`.
- Production execution requires reviewed staging evidence before apply or ledger repair.
- Phase 8 closeout is still blocked because all 20 manifest rows lack complete production evidence.

## Read-Only Verification Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --plan --stream bond_finance_runtime --json
node scripts/supabase-phase7-production-execution.mjs --plan --stream bond_finance_runtime --json
```

