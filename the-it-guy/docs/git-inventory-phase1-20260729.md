# Git Inventory - Phase 1

Generated: 2026-07-29  
Repository: `/Users/alexanderlandman/the-it-guy`  
Remote: `origin` / `git@github.com:alexlandman1998-123/bridge.git`

## Summary

| Area | Count | Notes |
| --- | ---: | --- |
| Local branches | 23 | Every local branch has an upstream remote and is currently pushed. |
| Local branches not merged into `main` | 17 | Includes the active public intake branch. |
| Remote branches not merged into `origin/main` | 18 | Includes older archive/WIP branches. |
| Open GitHub PRs | 3 | All are draft PRs. |
| Registered worktrees | 12 | 5 live and clean, 7 stale/prunable. |
| Current working tree | clean | Current branch is `codex/agency-public-intake-phase8`. |

`main` and `origin/main` are aligned at `37ab3322` (`Fix seller onboarding fee consent submit`).  
Current `HEAD` is `254a71b4` (`Expose public intake settings entry`).

## Open PRs

| PR | Branch | Base | Draft | Updated | Title |
| --- | --- | --- | --- | --- | --- |
| [#6](https://github.com/alexlandman1998-123/bridge/pull/6) | `agent/document-generation-cleanup-final-closure` | `main` | yes | 2026-07-27 | Close document generation cleanup |
| [#2](https://github.com/alexlandman1998-123/bridge/pull/2) | `codex/simple-connected-attorney-dropdown` | `main` | yes | 2026-07-20 | Simplify connected attorney selection |
| [#1](https://github.com/alexlandman1998-123/bridge/pull/1) | `codex/mvp-pilot-readiness` | `main` | yes | 2026-07-22 | Prepare controlled Arch9 pilot release |

Notable active branch without an open PR:

| Branch | Status |
| --- | --- |
| `codex/agency-public-intake-phase8` | pushed, clean, unmerged, no open PR |

## Worktrees

| Path | Branch | Exists | Clean / Dirty | Action Signal |
| --- | --- | --- | --- | --- |
| `/Users/alexanderlandman/the-it-guy` | `codex/agency-public-intake-phase8` | yes | clean | active feature worktree |
| `/private/tmp/seller-activation-prod` | `codex/seller-portal-activation-prod` | yes | clean | branch already merged into `main` |
| `/private/tmp/the-it-guy-main-reconciliation-20260728` | `codex/main-reconciliation-20260728` | yes | clean | branch already merged into `main` |
| `/Users/alexanderlandman/arch9-mvp-release` | `codex/arch9-mvp-release` | yes | clean | unmerged, no open PR |
| `/Users/alexanderlandman/arch9-production-deploy-20260719` | `codex/wip-arch9-migration-reconciliation-20260723` | yes | clean | unmerged WIP/archive branch |
| `/private/tmp/arch9-mandate-flow-release` | detached | no | unavailable | prunable stale record |
| `/private/tmp/bridge-dashboard-prod-e89e23c3` | detached | no | unavailable | prunable stale record |
| `/private/tmp/bridge-dashboard-prod-main` | detached | no | unavailable | prunable stale record |
| `/private/tmp/bridge-deploy-6ab1600` | detached | no | unavailable | prunable stale record |
| `/private/tmp/bridge-deploy-ad1f2d6` | detached | no | unavailable | prunable stale record |
| `/private/tmp/bridge-storage-policy-token-proof` | `codex/storage-policy-token-proof` | no | unavailable | prunable stale record |
| `/private/tmp/bridge-transaction-spine-release-20260723` | `codex/transaction-spine-release-contained` | no | unavailable | prunable stale record |

## Local Branches

| Branch | Merge State vs `main` | Pushed | Worktree | PR |
| --- | --- | --- | --- | --- |
| `agent/document-generation-cleanup-final-closure` | unmerged | yes | none | [#6](https://github.com/alexlandman1998-123/bridge/pull/6) draft |
| `codex-document-access-permissions-phase7` | unmerged | yes | none | no PR |
| `codex-seller-onboarding-mobile-phases` | merged | yes | none | no PR |
| `codex/agency-public-intake-phase8` | unmerged | yes | clean | no PR |
| `codex/arch9-mvp-release` | unmerged | yes | clean | no PR |
| `codex/archive-dashboard-performance-20260723` | unmerged | yes | none | no PR |
| `codex/archive-phase39-baseline-20260723` | unmerged | yes | none | no PR |
| `codex/archline-attorney-workspace` | unmerged | yes | none | no PR |
| `codex/auth-bridge-bootstrap-timeout` | unmerged | yes | none | no PR |
| `codex/bond-demo-applications-seed-20260728` | unmerged | yes | none | no PR |
| `codex/db-phase0-reconciliation` | unmerged | yes | none | no PR |
| `codex/demo-launch-wip-slice` | unmerged | yes | none | no PR |
| `codex/fix-seller-portal-token` | unmerged | yes | none | no PR |
| `codex/main-reconciliation-20260728` | merged | yes | clean | no PR |
| `codex/mvp-pilot-readiness` | unmerged | yes | none | [#1](https://github.com/alexlandman1998-123/bridge/pull/1) draft |
| `codex/produktive-agent-provisioning` | unmerged | yes | none | no PR |
| `codex/seller-portal-activation-prod` | merged | yes | clean | no PR |
| `codex/simple-connected-attorney-dropdown` | unmerged | yes | none | [#2](https://github.com/alexlandman1998-123/bridge/pull/2) draft |
| `codex/storage-policy-token-proof` | merged | yes | stale/prunable | no PR |
| `codex/transaction-spine-release-contained` | merged | yes | stale/prunable | no PR |
| `codex/wip-arch9-migration-reconciliation-20260723` | unmerged | yes | clean | no PR |
| `codex/wip-shared-worktree-20260723` | unmerged | yes | none | no PR |
| `main` | base | yes | none | n/a |

## Remote Branches

Remote branches already merged into `origin/main`:

| Branch |
| --- |
| `origin/agent/restore-seller-onboarding-welcome` |
| `origin/codex-seller-onboarding-mobile-phases` |
| `origin/codex/main-reconciliation-20260728` |
| `origin/codex/production-signing-flow` |
| `origin/codex/seller-portal-activation-prod` |
| `origin/codex/storage-policy-token-proof` |
| `origin/codex/transaction-spine-release-contained` |
| `origin/main` |

Remote branches not merged into `origin/main`:

| Branch | Local Branch | PR |
| --- | --- | --- |
| `origin/agent/document-generation-cleanup-final-closure` | yes | [#6](https://github.com/alexlandman1998-123/bridge/pull/6) draft |
| `origin/codex-document-access-permissions-phase7` | yes | no PR |
| `origin/codex/agency-public-intake-phase8` | yes | no PR |
| `origin/codex/arch9-mvp-release` | yes | no PR |
| `origin/codex/archive-dashboard-performance-20260723` | yes | no PR |
| `origin/codex/archive-phase39-baseline-20260723` | yes | no PR |
| `origin/codex/archline-attorney-workspace` | yes | no PR |
| `origin/codex/auth-bridge-bootstrap-timeout` | yes | no PR |
| `origin/codex/bond-demo-applications-seed-20260728` | yes | no PR |
| `origin/codex/db-phase0-reconciliation` | yes | no PR |
| `origin/codex/demo-launch-wip-slice` | yes | no PR |
| `origin/codex/fix-seller-portal-token` | yes | no PR |
| `origin/codex/hq-owner-dashboard` | no | no PR |
| `origin/codex/mvp-pilot-readiness` | yes | [#1](https://github.com/alexlandman1998-123/bridge/pull/1) draft |
| `origin/codex/produktive-agent-provisioning` | yes | no PR |
| `origin/codex/simple-connected-attorney-dropdown` | yes | [#2](https://github.com/alexlandman1998-123/bridge/pull/2) draft |
| `origin/codex/wip-arch9-migration-reconciliation-20260723` | yes | no PR |
| `origin/codex/wip-shared-worktree-20260723` | yes | no PR |

## Phase 1 Findings

- No live worktree has uncommitted changes.
- No local branch is ahead of its upstream; local branches with upstreams are pushed.
- The active public intake branch is the highest-priority unmerged branch and has no PR yet.
- Seven stale worktree records can be removed later with `git worktree prune`.
- Two live worktrees are on branches already merged into `main`: `codex/seller-portal-activation-prod` and `codex/main-reconciliation-20260728`.
- Several unmerged branches appear to be archive/WIP by name and should be classified before deletion or merging.

## Recommended Phase 2 Focus

Protect these before cleanup:

| Branch | Why |
| --- | --- |
| `codex/agency-public-intake-phase8` | active feature, pushed, no PR yet |
| `agent/document-generation-cleanup-final-closure` | open draft PR |
| `codex/simple-connected-attorney-dropdown` | open draft PR |
| `codex/mvp-pilot-readiness` | open draft PR |
| `codex/arch9-mvp-release` | live clean worktree, unmerged |
| `codex/wip-arch9-migration-reconciliation-20260723` | live clean worktree, unmerged WIP |
