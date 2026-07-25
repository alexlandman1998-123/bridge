# Supabase Phase 8 Closeout Readiness Plan

Generated: 2026-07-25

## Scope

Phase 8 turns the migration cleanup work into a closeout gate. It does not apply SQL, repair the migration ledger, remove the Phase 0 guard, or retire the broad-push freeze.

The closeout gate is implemented by:

- `scripts/supabase-phase8-closeout.mjs`
- `docs/supabase-phase-8-closeout-report.md`
- `docs/supabase-phase-8-closeout-evidence.json`

## Implemented

- Extended the Phase 8 closeout script to include a stream-level evidence matrix.
- Extended the generated closeout report with a full work queue showing version, stream, evidence status, action, object status, and file.
- Regenerated the live closeout report.
- Verified that the report remains `CLOSEOUT_BLOCKED` while reviewed evidence is missing.

## Current Closeout State

| Check | Result |
| --- | --- |
| Manifest rows | 20 |
| Complete production evidence rows | 0 |
| Incomplete production evidence rows | 20 |
| Duplicate local migration versions | 0 |
| Missing manifest files | 0 |
| Pure local-only versions | 20 |
| Pure remote-only versions | 16 |
| Unreviewed split versions | 10 |
| Production PITR | Disabled |
| Physical backups | 8 |
| Freeze retirement | Blocked |

## Evidence By Stream

| Stream | Rows | Complete Evidence | Incomplete Evidence |
| --- | ---: | ---: | ---: |
| `legal_document_runtime` | 15 | 0 | 15 |
| `seller_transaction_continuity` | 1 | 0 | 1 |
| `bond_finance_runtime` | 2 | 0 | 2 |
| `attorney_workflow_runtime` | 1 | 0 | 1 |
| `workspace_profile_management` | 1 | 0 | 1 |

## Closeout Rule

The Phase 0 guard and broad-push freeze may only be removed after a reviewed closeout report says `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`.

That requires:

- every manifest row has reviewed staging and production evidence
- production target state is verified for every row
- production ledger state is recorded for every row
- catalog checks pass
- behavior checks pass
- rollback or no-residue checks pass
- no unknown or duplicate evidence rows exist
- no duplicate local migration versions exist
- no manifest files are missing
- live ledger drift is resolved
- production recovery is available and tested

## Read-Only Verification Commands

```bash
npm run supabase:phase8
node scripts/supabase-phase8-closeout.mjs --plan --json
```

