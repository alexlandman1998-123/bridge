# Branch reconciliation — 5 September 2026

## Scope and baseline

This register reconciles the repository against `origin/main` at
`2c0d8b4154bbd307965fdfd67964a04e3c347a42`. Remote references were refreshed
with `git fetch --prune origin` before this assessment.

The outcome is deliberately conservative: an old divergent branch is not a
safe merge candidate merely because it contains commits not on `main`.

## Decisions

### 1. Already-integrated remote branches — candidate prune list

The following 14 remote branches are already contained in `origin/main`.
They are eligible for remote deletion only after the release owner confirms the
exact list; none were deleted during this phase.

- `agent/dashboard-domain-api-phase2`
- `codex/agency-public-intake-pr`
- `codex/arch9-attorney-access-permission-bootstrap`
- `codex/hq-owner-dashboard`
- `codex/main-reconciliation-20260728`
- `codex/migration-reconciliation-20260730`
- `codex/reconcile-unmerged-branches-20260811`
- `codex/reconciliation-phase10-closeout-20260811`
- `codex/recover-buyer-onboarding-projection-20260801`
- `codex/reminder-health-controls`
- `codex/seller-portal-activation-prod`
- `codex/supabase-preview-ledger-followup-20260811`
- `debie_dejager_branch`
- `ops/production-evidence-202607310006`

### 2. Unmerged divergent branches — no direct merge

There are 30 remote branches not merged into the baseline. Every one is
materially behind `main` (171–906 commits), so no branch should be merged
wholesale. A release owner should choose one of: **selectively salvage**,
**assign an active owner and target release**, or **archive**.

#### Selective-salvage review first

These contain recent or relatively concentrated work and should be compared by
feature/file before any cherry-pick or reimplementation:

| Branch | Behind / ahead | Recommended disposition |
| --- | ---: | --- |
| `release/production-stabilization-20260830` | 171 / 15 | Review against current production baseline; salvage only verified fixes. |
| `release/client-portal-mobile-launch` | 171 / 10 | Review mobile portal changes as individual features. |
| `codex/forward-port-buyer-seller-bond-workflows-20260811` | 421 / 23 | Extract still-missing workflow fixes into new focused branches. |
| `codex/kingston-seller-process-release` | 513 / 14 | Compare seller-process behaviour before porting selected changes. |
| `codex/seller-first-contact-reload` | 447 / 14 | Review only the first-contact reload fix and its tests. |
| `codex/navigation-query-phase6` | 186 / 6 | Assess as a small, isolated navigation fix. |
| `codex/buyer-portal-phase7-cutover` | 186 / 2 | Assess the portal cutover changes individually. |

#### Archive after owner review

These are clearly labelled as old experiments, WIP, archival, demo, or
superseded MVP/release work. Preserve their refs until an owner confirms that
there is no unique change worth extracting, then archive/delete rather than
merge:

- `codex/wip-arch9-migration-reconciliation-20260723`
- `codex/wip-shared-worktree-20260723`
- `codex/demo-launch-wip-slice`
- `codex/archive-dashboard-performance-20260723`
- `codex/archive-phase39-baseline-20260723`
- `codex/mvp-pilot-readiness`
- `codex/arch9-mvp-release`
- `codex/archline-attorney-workspace`
- `codex/simple-connected-attorney-dropdown`
- `codex/db-phase0-reconciliation`
- `codex-document-access-permissions-phase7`

#### Retain pending owner/target decision

The remaining divergent branches need a named owner and release target before
they can be reconciled. Their divergence makes automatic cleanup or merging
unsafe.

- `agent/buyer-viewing-email-polish`
- `agent/document-generation-cleanup-final-closure`
- `agent/legal-document-notification-sequence-phase1`
- `codex/agency-public-intake-phase8`
- `codex/auth-bridge-bootstrap-timeout`
- `codex/bond-demo-applications-seed-20260728`
- `codex/fix-seller-portal-token`
- `codex/integrate-production-evidence-catchup-20260801`
- `codex/phase0-closeout-evidence`
- `codex/produktive-agent-provisioning`
- `codex/reconcile-migration-drift-20260731`
- `codex/seller-process-next-action-fix`

## Local safety branches

Keep `codex/phase1-workspace-snapshot-20260905` through the current release:
it is the complete pre-reconciliation safety snapshot. The following local-only
branches should also be explicitly reviewed before removal: the two
`backup/main-before-*` refs, `codex/forward-port-production-stabilization`,
`codex/private-property-isolation-20260831`,
`codex/property24-draft-quota-production`, `codex/release-amended-5b031241`,
`codex/storage-quota-recovery`, and `codex/tuckers-access-hotfix`.

## Worktree hygiene performed

`git worktree prune` removed seven stale Git metadata entries whose gitdir
targets no longer existed. It did not delete a worktree directory or repository
files. The valid rental, bond, document-trust, and user-owned worktrees remain
registered.

## Next action

Obtain confirmation for the 14 already-integrated remote branches, then delete
only that approved list. Schedule selective feature comparison for the seven
priority branches before deciding whether their remaining changes should be
ported to fresh, production-based branches.
