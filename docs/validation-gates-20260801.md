# Validation Gates

Date: 2026-08-01

## Scope

These gates apply to the current reconciliation branch:

- `codex/integrate-production-evidence-catchup-20260801`
- locked code baseline `origin/main` at `f4c2efd0b296db9b0a5de201a9f748f7094aff37`
- locked production evidence checkpoint `origin/ops/production-evidence-202607310006`
- pending catch-up migrations `202608010001`, `202608010002`, and `202608010003`
- fresh integration branches created from `origin/main`

No gate below authorizes broad `supabase db push`, historical migration edits, direct production mutation, or wholesale merges from stale branches.

## Current Gate Status

| Gate | Status | Evidence |
| --- | --- | --- |
| Baseline locked | Passed | `origin/main` and `origin/ops/production-evidence-202607310006` recorded in `docs/branch-migration-reconciliation-20260801.md`. |
| Branch triage complete | Passed | Buckets and integration branches recorded in `docs/branch-migration-reconciliation-20260801.md`. |
| Migration reconciliation complete | Passed | Detailed migration audit recorded in `docs/migration-reconciliation-pass-20260801.md`. |
| Local runner tests | Passed | Commands listed below all passed on 2026-08-01. |
| Staging plan dry run | Passed | `node scripts/supabase-phase6-staging-execution.mjs --plan --json` returned 36 rows in dependency order. |
| Production plan dry run | Passed | `node scripts/supabase-phase7-production-execution.mjs --plan --json` returned 36 rows in dependency order. |
| Staging evidence for `202608010001` through `202608010003` | Passed | Three rows are complete in `docs/supabase-push-phase-4-staging-evidence.json`. |
| Production promotion for `202608010001` through `202608010003` | Passed | Three rows were applied and ledger-recorded in production one version at a time. |
| Production evidence closeout | Passed | `docs/supabase-push-phase-6-production-evidence.json` has 36 complete rows; closeout records 36 rows. |
| New branch migrations | Open | New branch migrations may proceed only through the fresh-forward gate and must be re-stamped after `202608010003`. |

## Local Validation Commands

These non-mutating validation commands passed:

```bash
node scripts/supabase-phase6-staging-execution.test.mjs
node scripts/supabase-phase7-production-execution.test.mjs
npm run test:supabase-push-promote-one
npm run test:supabase-push-phase6
npm run test:supabase-push-phase7
npm run test:supabase-push-complete-staging-evidence
npm run test:supabase-push-lock-recovery
npm run test:supabase-push-clear-non-runnable
npm run test:supabase-configure-staging
npm run test:staging-env
npm run test:supabase-resolve-ledger-drift
```

Plan-only validation commands passed without applying SQL:

```bash
node scripts/supabase-phase6-staging-execution.mjs --plan --json
node scripts/supabase-phase7-production-execution.mjs --plan --json
```

## Evidence Counts

| Artifact | Rows | Complete / Ready | Pending / Blocked | Notes |
| --- | ---: | ---: | ---: | --- |
| `docs/supabase-push-phase-4-staging-evidence.json` | 36 | 36 complete | 0 pending | The three `20260801` staging evidence rows are complete. |
| `docs/supabase-push-phase-5-production-promotion.json` | 36 | 36 ready | 0 blocked | The three `20260801` rows were promoted to production. |
| `docs/supabase-push-phase-6-production-evidence.json` | 36 | 36 complete | 0 pending | Closeout rows recorded: 36. |

Pending versions:

| Version | Migration | Current Gate |
| --- | --- | --- |
| `202608010001` | `202608010001_seller_onboarding_progress_fast_return.sql` | Complete in staging and production. |
| `202608010002` | `202608010002_fix_legal_document_agent_context_lead_lookup.sql` | Complete in staging and production. |
| `202608010003` | `202608010003_legal_document_job_stage_timings_phase7.sql` | Complete in staging and production. |

## Execution Note

While applying `202608010003` to staging, the runner blocked because staging lacked `public.legal_document_jobs`. Production already had `202607300001` recorded and the table present, so this was repaired as staging-only drift:

- applied `supabase/migrations/202607300001_legal_document_job_tracking_phase1.sql` to staging
- recorded staging ledger version `202607300001`
- verified `public.legal_document_jobs`, `bridge_create_legal_document_job_phase1`, and staging ledger presence
- retried and completed `202608010003`

## Required Staging Gate

For each pending version, staging evidence must record:

- real staging project ref
- staging ledger entry
- catalog checks
- behavior checks
- rollback or no-residue checks
- reviewer
- approver

Run one version at a time:

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010001 --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010001 --evidence docs/staging-evidence/202608010001-other.json --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010002 --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010002 --evidence docs/staging-evidence/202608010002-other.json --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010003 --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010003 --evidence docs/staging-evidence/202608010003-other.json --confirm APPLY_TO_STAGING_ONLY
```

## Required Production Gate

Production remains closed until the staging gate is complete for the specific version.

Run one version at a time, in order:

```bash
node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010001 --staging-evidence docs/staging-evidence/202608010001-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010001 --staging-evidence docs/staging-evidence/202608010001-other.json --production-evidence docs/production-evidence/202608010001-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010002 --staging-evidence docs/staging-evidence/202608010002-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010002 --staging-evidence docs/staging-evidence/202608010002-other.json --production-evidence docs/production-evidence/202608010002-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010003 --staging-evidence docs/staging-evidence/202608010003-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010003 --staging-evidence docs/staging-evidence/202608010003-other.json --production-evidence docs/production-evidence/202608010003-other.json --confirm APPLY_TO_PRODUCTION
```

## Integration Branch Gate

Before any fresh integration branch is merged:

1. Rebase or recreate the branch from the locked `origin/main` baseline or a newer approved baseline.
2. Confirm no historical migration files are modified, deleted, or renamed.
3. Re-stamp any selected branch migration as a new forward migration after `202608010003`, unless the branch has no migration port.
4. Regenerate manifest, staging evidence, production promotion, and production evidence artifacts after adding any new migration.
5. Run the local validation commands in this report.
6. Complete staging evidence for the new migration.
7. Promote and record production evidence one version at a time.
8. Run closeout only after production evidence is complete.

## Exit Criteria

The reconciliation is up to date for the current 36-row promotion scope because:

- `202608010001`, `202608010002`, and `202608010003` are complete in staging evidence.
- The same three versions are complete in production evidence.
- Closeout includes all 36 current promotion rows.
- Live Phase 8 closeout reports `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`.
- Any future selected open-branch migration still must be recreated as a fresh forward migration and pass the same gates.
