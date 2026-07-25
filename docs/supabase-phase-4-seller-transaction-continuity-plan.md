# Supabase Phase 4 Seller Transaction Continuity Plan

Generated: 2026-07-25

## Scope

Phase 4 isolates the seller document-to-transaction continuity migration from unrelated bond, attorney, and workspace rows. This phase does not apply SQL, repair the migration ledger, or retire the Phase 0 broad-push freeze.

The target stream is:

- `seller_transaction_continuity`

## Implemented

- Added explicit deployment streams for the remaining non-legal manifest rows:
  - `seller_transaction_continuity`
  - `bond_finance_runtime`
  - `attorney_workflow_runtime`
  - `workspace_profile_management`
- Regenerated the Phase 5 module drift report and application manifest.
- Regenerated the Phase 8 closeout report.
- Verified that staging and production runners both isolate seller continuity as a single-row stream.

## Seller Continuity Plan

| Version | Action | Evidence | File |
| --- | --- | --- | --- |
| `202607230001` | `corrective_migration_required` | `partial_live` 2/17 | `202607230001_reconcile_seller_document_transaction_continuity.sql` |

The row depends on `stream preflight`, not on bond finance, attorney workflow, or workspace profile migrations.

## Why It Is Corrective

Production has only part of the expected seller continuity catalog live. The original migration preserves and wraps the existing seller-document promoter, then layers continuity enrichment around it. Because live state is partial, the next database-changing step must be a reviewed corrective migration, not a blind replay of the original SQL.

The corrective migration must prove these outcomes in staging before production:

- Existing seller portal document promotion still works.
- Seller-uploaded documents link to the transaction document record.
- Canonical requirement and transaction-required-document status are updated consistently.
- Document request rows are satisfied when a matching seller document already exists.
- Pending seller documents are promoted when a transaction becomes available.
- No duplicate document upload events or duplicate transaction documents are created.

## Remaining Streams

| Stream | Rows | Next Gate |
| --- | ---: | --- |
| `legal_document_runtime` | 15 | Continue row-by-row through the Phase 3 plan. |
| `seller_transaction_continuity` | 1 | Create and test an idempotent corrective migration. |
| `bond_finance_runtime` | 2 | Apply originals only after dependency and staging checks. |
| `attorney_workflow_runtime` | 1 | Repair-only after workflow smoke evidence. |
| `workspace_profile_management` | 1 | Apply original only after dependency and staging checks. |

## Current Blockers

Live mutation remains blocked by the repository gates:

- No staging target environment is configured.
- No reviewed staging evidence exists for `202607230001`.
- Production execution requires reviewed staging evidence before apply or ledger repair.
- Phase 8 closeout is still blocked because all 20 manifest rows lack complete production evidence.

## Read-Only Verification Commands

```bash
npm run supabase:phase5
npm run supabase:phase8
node scripts/supabase-phase6-staging-execution.mjs --plan --stream seller_transaction_continuity --json
node scripts/supabase-phase7-production-execution.mjs --plan --stream seller_transaction_continuity --json
```

