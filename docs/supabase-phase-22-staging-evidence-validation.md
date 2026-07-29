# Supabase Phase 22: Staging Evidence Validation

Generated: `2026-07-29T19:43:09Z`

## Scope

Phase 22 validates whether the current Phase 21 staging train has complete staging evidence. It does not apply SQL, record staging ledgers, relink Supabase, or invent evidence.

## Result

Status: `BLOCKED_STAGING_EVIDENCE_MISSING`

| Field | Value |
| --- | ---: |
| Runner-eligible rows | 32 |
| Complete staging evidence rows | 0 |
| Pending staging evidence rows | 32 |
| SQL apply rows | 26 |
| Repair-only rows | 6 |
| Staging environment configured | No |
| Phase 1 receipt ready | Yes |

## Blocking Conditions

Every current staging row is blocked by:

- `staging_project_ref_env_missing`
- `staging_db_url_env_missing`
- `staging_recovery_confirmation_missing`
- `staging_evidence_missing`

The generated validation report is:

`docs/supabase-push-staging-evidence-completion-report.md`

The machine-readable report is:

`docs/supabase-push-staging-evidence-completion.json`

## Completion Packets

The validator generated per-version completion packets under:

`docs/staging-evidence-completion/`

These packets list the exact apply or repair command for each row and the evidence fields required before the row can be considered complete.

## Required Before Phase 22 Can Pass

1. Configure a real non-production staging target:

```bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
```

2. Execute Phase 21 one row at a time using the commands in `docs/supabase-push-phase-3-action-routing-report.md`.

3. For each row, create real evidence under `docs/staging-evidence/` proving:

- `targetProjectRef` and `stagingProjectRef` are the non-production staging ref;
- `sqlApplied` matches the route (`true` for `apply_original`, `false` for `repair_only`);
- `stagingLedgerRecorded: true`;
- `catalogChecks: "pass"`;
- `behaviorChecks: "pass"`;
- `rollbackOrNoResidue: "pass"`;
- `reviewedBy`, `approvedBy`, and `capturedAt` are populated.

4. Rerun:

```bash
node scripts/supabase-push-complete-staging-evidence.mjs
```

## Phase 22 Outcome

The evidence gate is working correctly. It reports `0/32` complete because Phase 21 has not run against a real staging project yet.

## Validation Commands

The Phase 22 evidence gate and adjacent Supabase guardrails were rerun locally after generating this report:

```bash
node scripts/supabase-push-complete-staging-evidence.test.mjs
node scripts/supabase-phase6-staging-execution.test.mjs
node scripts/supabase-phase7-production-execution.test.mjs
node scripts/supabase-phase8-closeout.test.mjs
node scripts/supabase-phase0-guard.test.mjs
node scripts/supabase-resolve-ledger-drift.test.mjs
git diff --check
```

All commands passed.
