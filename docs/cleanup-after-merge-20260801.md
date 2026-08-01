# Cleanup After Merge

Date: 2026-08-01

## Scope

This cleanup pass is a post-merge runbook. It should be executed only after the reconciliation/evidence work is merged and the validation gates in `docs/validation-gates-20260801.md` are satisfied for the relevant branch.

No branch deletion was performed during this pass.

## Cleanup Preconditions

Before deleting or archiving any branch:

1. Confirm the branch has no commits ahead of the target baseline:

```bash
git rev-list --left-right --count origin/main...<branch>
```

The second number must be `0` before a branch is treated as merged or empty.

2. Confirm the worktree is clean or that only the intended reconciliation files remain staged/committed:

```bash
git status --short --branch
```

3. Confirm PRs and deployment/evidence records no longer reference the branch as the active source of truth.
4. Keep `origin/ops/production-evidence-202607310006` until a newer production evidence checkpoint exists and is merged.

## Safe Local Cleanup After Merge

These local branches currently have `0` commits ahead of `origin/main`; they are cleanup candidates after confirming no one needs their branch names for local audit history:

| Local Branch | Ahead Of `origin/main` | Behind `origin/main` | Cleanup Decision |
| --- | ---: | ---: | --- |
| `agent/dashboard-domain-api-phase2` | 0 | 33 | Delete local ref after audit confirmation. |
| `codex/agency-public-intake-pr` | 0 | 69 | Delete local ref after audit confirmation. |
| `codex/main-reconciliation-20260728` | 0 | 89 | Delete local ref after audit confirmation. |
| `codex/migration-reconciliation-20260730` | 0 | 54 | Delete local ref after audit confirmation. |
| `codex/seller-portal-activation-prod` | 0 | 88 | Delete local ref after audit confirmation. |

Suggested local deletion command after confirmation:

```bash
git branch -d agent/dashboard-domain-api-phase2
git branch -d codex/agency-public-intake-pr
git branch -d codex/main-reconciliation-20260728
git branch -d codex/migration-reconciliation-20260730
git branch -d codex/seller-portal-activation-prod
```

Use `git branch -D` only with explicit approval and only after preserving any required audit notes elsewhere.

## Empty Integration Branch Cleanup

These local integration branches currently point exactly at `origin/main` and have `0` commits ahead or behind. If they are not used for their intended porting work, delete them locally after the reconciliation plan is merged:

| Local Integration Branch | Cleanup Decision |
| --- | --- |
| `codex/integrate-agency-public-intake-20260801` | Delete if no public-intake port is started. |
| `codex/integrate-archline-attorney-workspace-20260801` | Delete if no attorney-workspace port is started. |
| `codex/integrate-bond-demo-seed-20260801` | Delete if no bond-demo seed port is started. |
| `codex/integrate-connected-attorney-dropdown-20260801` | Delete if no connected-attorney port is started. |
| `codex/integrate-hq-owner-dashboard-20260801` | Delete if no dashboard port is started. |
| `codex/integrate-ledger-drift-resolution-20260801` | Delete if no ledger-drift port is started. |
| `codex/integrate-legal-notification-dashboard-20260801` | Delete if no legal-notification dashboard port is started. |
| `codex/integrate-phase0-closeout-20260801` | Delete if no phase0 closeout port is started. |
| `codex/integrate-produktive-provisioning-20260801` | Delete if no provisioning port is started. |
| `codex/integrate-reminder-health-controls-20260801` | Delete if no reminder-health port is started. |
| `codex/integrate-seller-mobile-portal-20260801` | Delete if no seller-mobile port is started. |
| `codex/integrate-transaction-progress-scheduler-20260801` | Delete if no scheduler port is started. |

Suggested local deletion command if they remain empty:

```bash
git branch -d codex/integrate-agency-public-intake-20260801
git branch -d codex/integrate-archline-attorney-workspace-20260801
git branch -d codex/integrate-bond-demo-seed-20260801
git branch -d codex/integrate-connected-attorney-dropdown-20260801
git branch -d codex/integrate-hq-owner-dashboard-20260801
git branch -d codex/integrate-ledger-drift-resolution-20260801
git branch -d codex/integrate-legal-notification-dashboard-20260801
git branch -d codex/integrate-phase0-closeout-20260801
git branch -d codex/integrate-produktive-provisioning-20260801
git branch -d codex/integrate-reminder-health-controls-20260801
git branch -d codex/integrate-seller-mobile-portal-20260801
git branch -d codex/integrate-transaction-progress-scheduler-20260801
```

Do not delete `codex/integrate-production-evidence-catchup-20260801` until the current reconciliation/evidence changes are committed, reviewed, merged, and represented by a newer baseline.

## Remote Cleanup Candidates

These remote refs currently have `0` commits ahead of `origin/main` and are candidates for remote deletion after owner confirmation:

| Remote Branch | Ahead Of `origin/main` | Behind `origin/main` | Cleanup Decision |
| --- | ---: | ---: | --- |
| `origin/codex/agency-public-intake-pr` | 0 | 69 | Delete remote ref after audit confirmation. |
| `origin/debie_dejager_branch` | 0 | 18 | Delete remote ref after confirming the branch owner no longer needs it. |

Suggested remote deletion commands after confirmation:

```bash
git push origin --delete codex/agency-public-intake-pr
git push origin --delete debie_dejager_branch
```

## Branches To Keep Until Replaced Or Merged

Do not delete these refs during cleanup. They still have commits ahead of `origin/main`, are active evidence checkpoints, or are reference material for selective porting:

- `codex/integrate-production-evidence-catchup-20260801`
- `origin/ops/production-evidence-202607310006`
- `origin/codex/recover-buyer-onboarding-projection-20260801`
- `origin/codex/reminder-health-controls`
- `origin/codex/reconcile-migration-drift-20260731`
- `origin/codex/phase0-closeout-evidence`
- `origin/codex/hq-owner-dashboard`
- `origin/codex/bond-demo-applications-seed-20260728`
- `origin/codex/produktive-agent-provisioning`
- any source branch still needed for selective reconstruction listed in `docs/branch-migration-reconciliation-20260801.md`

## Artifact Cleanup After Final Closeout

After staging and production evidence are complete for `202608010001` through `202608010003`, regenerate and verify:

```bash
npm run test:supabase-push-promote-one
npm run test:supabase-push-phase6
npm run test:supabase-push-phase7
node scripts/supabase-phase8-closeout.mjs --plan --json
```

Then confirm:

- `docs/supabase-push-phase-4-staging-evidence.json` has 36 complete rows.
- `docs/supabase-push-phase-5-production-promotion.json` has 36 ready rows.
- `docs/supabase-push-phase-6-production-evidence.json` has 36 complete rows.
- `docs/supabase-phase-8-closeout-evidence.json` includes all 36 current promotion rows.
- The three temporary pending placeholders are no longer pending:
  - `docs/staging-evidence/202608010001-other.json`
  - `docs/staging-evidence/202608010002-other.json`
  - `docs/staging-evidence/202608010003-other.json`
  - `docs/production-evidence/202608010001-other.json`
  - `docs/production-evidence/202608010002-other.json`
  - `docs/production-evidence/202608010003-other.json`

## Final Cleanup Gate

Cleanup is complete only when:

- merged or empty local branches are deleted or intentionally retained with a reason
- remote cleanup candidates are deleted only after owner confirmation
- stale source branches are either archived, ported, or explicitly retained as reference material
- `origin/ops/production-evidence-202607310006` has been replaced by a newer merged evidence checkpoint before deletion is considered
- `git fetch --all --prune` shows no unexpected stale refs
- `git status --short --branch` is clean on the final baseline branch
