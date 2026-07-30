# Git Protection - Phase 2

Generated: 2026-07-29  
Repository: `/Users/alexanderlandman/the-it-guy`  
Purpose: protect active work before PR creation, branch refresh, merge, worktree pruning, or branch deletion.

## Current State

Current branch: `codex/agency-public-intake-phase8`  
Current branch status: clean relative to upstream  
Intentional untracked artifact: `the-it-guy/docs/git-inventory-phase1-20260729.md`

The Phase 1 inventory report is active work and must be preserved. Do not switch branches, prune, or clean the tree in a way that drops this file unless it has first been committed, stashed, or explicitly discarded by the user.

## Protected Branches

Do not delete, force-push, reset, squash away, or prune the following branches until their owner/status is resolved.

| Branch | Protection Reason | Current Signal | Required Next Step |
| --- | --- | --- | --- |
| `codex/agency-public-intake-phase8` | Active public agency intake feature from today | pushed, clean, unmerged, no PR | create PR in Phase 3 |
| `agent/document-generation-cleanup-final-closure` | Open draft PR #6 | pushed, unmerged | inspect PR before close/merge |
| `codex/simple-connected-attorney-dropdown` | Open draft PR #2 | pushed, unmerged | inspect PR before close/merge |
| `codex/mvp-pilot-readiness` | Open draft PR #1 | pushed, unmerged | inspect PR before close/merge |
| `codex/arch9-mvp-release` | Live clean worktree outside repo root | pushed, unmerged, no PR | classify before cleanup |
| `codex/wip-arch9-migration-reconciliation-20260723` | Live clean worktree outside repo root | pushed, unmerged WIP/archive, no PR | classify before cleanup |

## Protected Live Worktrees

These worktrees exist on disk and must not be removed until their branch status is handled.

| Worktree | Branch | Protection |
| --- | --- | --- |
| `/Users/alexanderlandman/the-it-guy` | `codex/agency-public-intake-phase8` | active feature workspace |
| `/Users/alexanderlandman/arch9-mvp-release` | `codex/arch9-mvp-release` | live unmerged workspace |
| `/Users/alexanderlandman/arch9-production-deploy-20260719` | `codex/wip-arch9-migration-reconciliation-20260723` | live unmerged WIP/archive workspace |

These live worktrees are clean and already merged into `main`, but still should not be removed without explicit cleanup approval:

| Worktree | Branch | Note |
| --- | --- | --- |
| `/private/tmp/seller-activation-prod` | `codex/seller-portal-activation-prod` | branch merged into `main` |
| `/private/tmp/the-it-guy-main-reconciliation-20260728` | `codex/main-reconciliation-20260728` | branch merged into `main` |

## Cleanup Allowlist Candidates

The following are candidates for later cleanup because they are stale/prunable worktree records pointing to missing paths. Phase 2 does **not** remove them; it only marks them as safe candidates for Phase 7.

| Stale Worktree Record | Branch / State |
| --- | --- |
| `/private/tmp/arch9-mandate-flow-release` | detached |
| `/private/tmp/bridge-dashboard-prod-e89e23c3` | detached |
| `/private/tmp/bridge-dashboard-prod-main` | detached |
| `/private/tmp/bridge-deploy-6ab1600` | detached |
| `/private/tmp/bridge-deploy-ad1f2d6` | detached |
| `/private/tmp/bridge-storage-policy-token-proof` | `codex/storage-policy-token-proof` |
| `/private/tmp/bridge-transaction-spine-release-20260723` | `codex/transaction-spine-release-contained` |

Allowed later command, after user confirms Phase 7:

```bash
git worktree prune
```

## Branches Not Protected By Active-Work Rules

These local branches are merged into `main`. They are cleanup candidates later, not protected active work.

| Branch | Reason |
| --- | --- |
| `codex-seller-onboarding-mobile-phases` | merged into `main` |
| `codex/main-reconciliation-20260728` | merged into `main` |
| `codex/seller-portal-activation-prod` | merged into `main` |
| `codex/storage-policy-token-proof` | merged into `main` |
| `codex/transaction-spine-release-contained` | merged into `main` |

These remote branches are also already merged into `origin/main`; they are cleanup candidates after confirmation.

| Remote Branch |
| --- |
| `origin/agent/restore-seller-onboarding-welcome` |
| `origin/codex-seller-onboarding-mobile-phases` |
| `origin/codex/main-reconciliation-20260728` |
| `origin/codex/production-signing-flow` |
| `origin/codex/seller-portal-activation-prod` |
| `origin/codex/storage-policy-token-proof` |
| `origin/codex/transaction-spine-release-contained` |

## Unclassified Unmerged Branches

These are unmerged and have no open PR. They are **not** deletion candidates yet. They need classification before Phase 6 or Phase 8.

| Branch | Remote | Initial Signal |
| --- | --- | --- |
| `codex-document-access-permissions-phase7` | yes | unmerged, no PR |
| `codex/archive-dashboard-performance-20260723` | yes | archive-named, unmerged |
| `codex/archive-phase39-baseline-20260723` | yes | archive-named, unmerged |
| `codex/archline-attorney-workspace` | yes | unmerged, no PR |
| `codex/auth-bridge-bootstrap-timeout` | yes | unmerged, no PR |
| `codex/bond-demo-applications-seed-20260728` | yes | unmerged, no PR |
| `codex/db-phase0-reconciliation` | yes | unmerged, no PR |
| `codex/demo-launch-wip-slice` | yes | WIP-named, unmerged |
| `codex/fix-seller-portal-token` | yes | unmerged, no PR |
| `codex/produktive-agent-provisioning` | yes | unmerged, no PR |
| `codex/wip-shared-worktree-20260723` | yes | WIP-named, unmerged |
| remote-only `origin/codex/hq-owner-dashboard` | remote only | unmerged, no PR |

## Guardrails For Future Phases

Before any cleanup command:

1. Re-run `git status --short --branch`.
2. Confirm `the-it-guy/docs/git-inventory-phase1-20260729.md` and this Phase 2 report are committed, stashed, or intentionally left as working-tree artifacts.
3. Do not run `git branch -D`, `git push origin --delete`, `git worktree remove`, `git reset --hard`, or `git clean` without a current allowlist and explicit user confirmation.
4. Treat all unmerged branches without PRs as unclassified until Phase 6.
5. Treat all open PR branches as protected until their PR is merged or explicitly closed.

## Phase 2 Result

Active work is now protected by this manifest. No branches, worktrees, PRs, or commits were modified during Phase 2.
