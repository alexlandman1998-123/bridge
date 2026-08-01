# Branch and Migration Reconciliation Baseline

Date: 2026-08-01

## Locked Git Baseline

- Code baseline: `origin/main`
- Code baseline SHA: `f4c2efd0b296db9b0a5de201a9f748f7094aff37`
- Code baseline tip: `Add mandate job stage timing logs`
- Code baseline tip date: `2026-08-01 22:33:29 +0200`

## Locked Production Evidence Checkpoint

- Production evidence checkpoint: `origin/ops/production-evidence-202607310006`
- Production evidence SHA: `2873c7240caf697fbe2ae2d959503a1004772f0e`
- Production evidence tip: `test: update staging plan count after promotion`
- Production evidence tip date: `2026-07-31 19:51:10 +0200`

## Branch And Tag Observations

- No local or remote git branch named `production` exists at this baseline.
- No git tags exist at this baseline.
- `origin/main` is 22 commits ahead of `origin/ops/production-evidence-202607310006`.
- `origin/ops/production-evidence-202607310006` has no commits ahead of `origin/main`.

## Baseline Rules

- Treat `origin/main` as the only code source of truth for follow-up integration work.
- Treat `origin/ops/production-evidence-202607310006` as the current production evidence checkpoint until a newer evidence branch is created and merged.
- Do not merge stale feature or migration branches wholesale into `main`.
- Port still-needed work onto fresh branches created from the locked `origin/main` baseline.
- Add new corrective or forward migrations from current `main` instead of editing historical migrations already present on `main`.
- Record staging and production evidence before considering migration work up to date against production.

## Immediate Follow-Up Scope

The next reconciliation step is to validate and evidence the three migrations present on `origin/main` after the production checkpoint:

- `supabase/migrations/202608010001_seller_onboarding_progress_fast_return.sql`
- `supabase/migrations/202608010002_fix_legal_document_agent_context_lead_lookup.sql`
- `supabase/migrations/202608010003_legal_document_job_stage_timings_phase7.sql`

## Production Evidence Catch-Up Queue

Status: complete. The three `20260801` migrations were applied and recorded one version at a time in staging and production on 2026-08-01.

The three migrations are now present in the manifest-driven promotion queue as `apply_original_after_dependency_check` rows:

- `202608010001` depends on `202607310006`
- `202608010002` depends on `202608010001`
- `202608010003` depends on `202608010002`

Generated queue and evidence artifacts:

- `docs/supabase-push-phase-2-stream-plans.json`
- `docs/supabase-push-phase-3-action-routing.json`
- `docs/supabase-push-phase-4-staging-evidence.json`
- `docs/supabase-push-phase-5-production-promotion.json`
- `docs/supabase-push-phase-6-production-evidence.json`
- `docs/staging-evidence/202608010001-other.json`
- `docs/staging-evidence/202608010002-other.json`
- `docs/staging-evidence/202608010003-other.json`
- `docs/production-evidence/202608010001-other.json`
- `docs/production-evidence/202608010002-other.json`
- `docs/production-evidence/202608010003-other.json`

The new rows are now copied into `docs/supabase-phase-8-closeout-evidence.json`. Staging and production evidence are complete for all 36 current promotion rows, and live Phase 8 closeout reports `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`.

During staging execution, `202608010003` exposed staging-only dependency drift: staging was missing `public.legal_document_jobs` and ledger version `202607300001`, while production already had both. The staging dependency was repaired by applying `202607300001_legal_document_job_tracking_phase1.sql` to staging and recording staging ledger version `202607300001`; production was not changed for that dependency.

Staging command sequence:

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010001 --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010001 --evidence docs/staging-evidence/202608010001-other.json --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010002 --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010002 --evidence docs/staging-evidence/202608010002-other.json --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608010003 --confirm APPLY_TO_STAGING_ONLY
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608010003 --evidence docs/staging-evidence/202608010003-other.json --confirm APPLY_TO_STAGING_ONLY
```

Production command sequence after staging evidence is complete:

```bash
node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010001 --staging-evidence docs/staging-evidence/202608010001-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010001 --staging-evidence docs/staging-evidence/202608010001-other.json --production-evidence docs/production-evidence/202608010001-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010002 --staging-evidence docs/staging-evidence/202608010002-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010002 --staging-evidence docs/staging-evidence/202608010002-other.json --production-evidence docs/production-evidence/202608010002-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010003 --staging-evidence docs/staging-evidence/202608010003-other.json --confirm APPLY_TO_PRODUCTION
node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010003 --staging-evidence docs/staging-evidence/202608010003-other.json --production-evidence docs/production-evidence/202608010003-other.json --confirm APPLY_TO_PRODUCTION
```

## Open Branch Triage

Status: triaged against `origin/main` after recovering the local buyer-onboarding commit.

### Ready For Fresh PR Review

These branches are small or recently recovered. Review them from fresh `main` branches and keep their migration/evidence paths explicit.

| Branch | Ahead | Migration diffs | Decision |
| --- | ---: | ---: | --- |
| `codex/recover-buyer-onboarding-projection-20260801` | 1 | 1 | Recovered from the old local-only commit; ready for PR review. |
| `codex/reminder-health-controls` | 1 | 1 | Small forward migration; port/review directly. |
| `codex/reconcile-migration-drift-20260731` | 1 | 0 | Documentation/evidence update; review directly. |
| `codex/phase0-closeout-evidence` | 2 | 0 | Review after production catch-up; changes freeze/closeout controls. |
| `codex/hq-owner-dashboard` | 1 | 0 | Remote-only small UI/refactor branch; review directly. |
| `codex/bond-demo-applications-seed-20260728` | 1 | 0 | Small seed/data branch; verify fixture intent before PR. |
| `codex/produktive-agent-provisioning` | 1 | 0 | Small frontend key/config branch; review directly. |

### Port Selectively Onto Fresh Branches

These branches have useful work, but should not be merged as-is because they are behind `main`, overlap with newer migrations, or modify historical migration files.

| Branch | Ahead | Migration diffs | Decision |
| --- | ---: | ---: | --- |
| `codex/agency-public-intake-phase8` | 3 | 3 | Port the public-intake feature and recreate/verify migration evidence from current `main`. |
| `agent/legal-document-notification-sequence-phase1` | 2 remote + 1 local superseded | 3 remote | Local-only work is now on `codex/recover-buyer-onboarding-projection-20260801`; review remaining dashboard migrations separately. `202607310007_seller_onboarding_progress_fast_return.sql` is superseded by `202608010001` on `main`. |
| `codex/simple-connected-attorney-dropdown` | 4 | 3 | Rebuild from current seller-attorney flow; do not modify the historical `20260719194500` migration in place. |
| `codex/archline-attorney-workspace` | 2 | 4 | Port UI/workspace behavior; replace branch-only migration intent with fresh forward migrations if still needed. |
| `codex/auth-bridge-bootstrap-timeout` | 13 | 20 | Extract seller/mobile portal behavior only; ignore migration timestamp renames unless a current ledger audit proves they are still needed. |
| `codex/wip-shared-worktree-20260723` | 2 | 2 | Extract only the transaction-progress scheduler proof if still relevant; avoid historical migration edits. |

### Archive Or Do Not Merge Wholesale

These branches are too large or too stale to merge safely. Treat them as reference material only, then create narrowly scoped replacement branches for any still-needed work.

| Branch | Ahead | Migration diffs | Reason |
| --- | ---: | ---: | --- |
| `codex/mvp-pilot-readiness` | 134 | 77 | Large divergent release/migration train. |
| `codex/db-phase0-reconciliation` | 27 | 79 | Large reconciliation branch with broad drift. |
| `codex/archive-phase39-baseline-20260723` | 64 | 42 | Archive baseline with production/reconciliation history. |
| `codex/fix-seller-portal-token` | 8 | 55 | Many older outstanding-migration artifacts and drift. |
| `codex/wip-arch9-migration-reconciliation-20260723` | 1 | 81 | Mostly migration renames/deletes; do not replay into current `main`. |
| `codex/arch9-mvp-release` | 36 | 2 | Old MVP release branch; extract tests/evidence only if still relevant. |
| `codex-document-access-permissions-phase7` | 16 | 15 | Older access/document branch with many migration files now likely superseded. |

### Low Priority Or Product Review First

These are open but have no migration diffs. They may still contain UI/product changes, so defer until the higher-risk migration branches are closed.

- `agent/document-generation-cleanup-final-closure`
- `codex/archive-dashboard-performance-20260723`
- `codex/demo-launch-wip-slice`

### Cleanup Candidates

These refs are already merged into `origin/main` and have no diff against it. Delete only after confirming nobody still needs the branch names for audit history.

- `agent/dashboard-domain-api-phase2` local-only
- `codex/agency-public-intake-pr`
- `codex/main-reconciliation-20260728` local-only
- `codex/migration-reconciliation-20260730` local-only
- `codex/seller-portal-activation-prod` local-only
- `debie_dejager_branch` remote-only

Keep `origin/ops/production-evidence-202607310006` as the locked production evidence checkpoint until a newer production evidence branch is created and merged.

## Fresh Integration Branches

Status: branch refs created from `origin/main` at `f4c2efd0b296db9b0a5de201a9f748f7094aff37`.

These branches are intentionally clean starting points. Port or cherry-pick only the reviewed scope from the source branch listed here.

| Integration Branch | Source Branch | Scope |
| --- | --- | --- |
| `codex/integrate-production-evidence-catchup-20260801` | `origin/main` plus local evidence updates | Queue and evidence packets for the three `20260801` migrations. |
| `codex/integrate-reminder-health-controls-20260801` | `codex/reminder-health-controls` | Reminder-health controls migration and targeted tests/evidence. |
| `codex/integrate-ledger-drift-resolution-20260801` | `codex/reconcile-migration-drift-20260731` | Ledger-drift documentation/evidence update. |
| `codex/integrate-phase0-closeout-20260801` | `codex/phase0-closeout-evidence` | Freeze-retirement and closeout control changes after production catch-up. |
| `codex/integrate-hq-owner-dashboard-20260801` | `origin/codex/hq-owner-dashboard` | Bond owner dashboard refactor. |
| `codex/integrate-bond-demo-seed-20260801` | `codex/bond-demo-applications-seed-20260728` | Bond demo application seed. |
| `codex/integrate-produktive-provisioning-20260801` | `codex/produktive-agent-provisioning` | Supabase publishable frontend key handling. |
| `codex/integrate-agency-public-intake-20260801` | `codex/agency-public-intake-phase8` | Public agency intake feature and fresh migration evidence. |
| `codex/integrate-legal-notification-dashboard-20260801` | `origin/agent/legal-document-notification-sequence-phase1` | Remaining dashboard/developer migrations only; local buyer-onboarding work already recovered separately. |
| `codex/integrate-connected-attorney-dropdown-20260801` | `codex/simple-connected-attorney-dropdown` | Connected attorney dropdown behavior rebuilt on current seller-attorney flow. |
| `codex/integrate-archline-attorney-workspace-20260801` | `codex/archline-attorney-workspace` | Attorney workspace behavior and fresh forward migrations if still needed. |
| `codex/integrate-seller-mobile-portal-20260801` | `codex/auth-bridge-bootstrap-timeout` | Seller/mobile portal behavior only; historical migration renames excluded by default. |
| `codex/integrate-transaction-progress-scheduler-20260801` | `codex/wip-shared-worktree-20260723` | Transaction-progress scheduler proof if still relevant. |

Already-created recovery branch:

- `codex/recover-buyer-onboarding-projection-20260801` from local-only commit `0c7e626c`, pushed at `926efe4ef39fec8e2f8cba240a37ef1a2a93d50f`.

## Migration Reconciliation Pass

Detailed migration audit and porting gate: `docs/migration-reconciliation-pass-20260801.md`.

## Validation Gates

Validation gate status and required commands: `docs/validation-gates-20260801.md`.

## Cleanup After Merge

Post-merge cleanup runbook: `docs/cleanup-after-merge-20260801.md`.
