# Phase 7: Prune Worktrees

Date: 2026-07-29

## Scope

Prune stale Git worktree metadata after Phase 6 closed superseded PRs. Follow the Phase 2 protection manifest: remove only prunable worktree records that point to missing locations, and preserve live worktree directories.

## Starting State

Git reported 12 worktree entries:

- 1 current repository worktree
- 4 live auxiliary worktrees
- 7 stale/prunable metadata entries

The stale entries were reported by Git as `prunable gitdir file points to non-existent location`.

## Dry Run

Command:

```bash
git worktree prune --dry-run --verbose
```

Dry-run removal candidates:

- `worktrees/bridge-dashboard-prod-e89e23c3`
- `worktrees/bridge-deploy-ad1f2d6`
- `worktrees/arch9-mandate-flow-release`
- `worktrees/bridge-transaction-spine-release-20260723`
- `worktrees/bridge-storage-policy-token-proof`
- `worktrees/bridge-deploy-6ab1600`
- `worktrees/bridge-dashboard-prod-main`

## Prune Action

Command:

```bash
git worktree prune --verbose
```

Removed stale metadata entries:

- `/private/tmp/arch9-mandate-flow-release`
- `/private/tmp/bridge-dashboard-prod-e89e23c3`
- `/private/tmp/bridge-dashboard-prod-main`
- `/private/tmp/bridge-deploy-6ab1600`
- `/private/tmp/bridge-deploy-ad1f2d6`
- `/private/tmp/bridge-storage-policy-token-proof`
- `/private/tmp/bridge-transaction-spine-release-20260723`

No live worktree directories were deleted.

## Remaining Live Worktrees

Git now reports 5 live worktrees:

| Worktree | Branch | Status |
| --- | --- | --- |
| `/Users/alexanderlandman/the-it-guy` | `codex/agency-public-intake-pr` | current workspace |
| `/private/tmp/seller-activation-prod` | `codex/seller-portal-activation-prod` | clean, tracking remote |
| `/private/tmp/the-it-guy-main-reconciliation-20260728` | `codex/main-reconciliation-20260728` | clean, tracking remote |
| `/Users/alexanderlandman/arch9-mvp-release` | `codex/arch9-mvp-release` | clean, tracking remote |
| `/Users/alexanderlandman/arch9-production-deploy-20260719` | `codex/wip-arch9-migration-reconciliation-20260723` | clean, tracking remote |

## Preserved Work

The following live worktrees were intentionally not removed:

- `/private/tmp/seller-activation-prod`
- `/private/tmp/the-it-guy-main-reconciliation-20260728`
- `/Users/alexanderlandman/arch9-mvp-release`
- `/Users/alexanderlandman/arch9-production-deploy-20260719`

Reason:

They are real worktree directories with branch checkouts. Removing them would delete working directories, so they should only be removed in a later explicit cleanup phase with a live-worktree removal allowlist.

## Final Repository State

- Current branch: `codex/agency-public-intake-pr`
- Worktree entries reduced from 12 to 5
- No branch deletions performed
- No remote branches changed
- No live worktree directories deleted

## Recommended Next Phase

Handle branch cleanup separately. Merged branches and archived WIP branches should be classified before any local branch deletion or remote branch deletion.
