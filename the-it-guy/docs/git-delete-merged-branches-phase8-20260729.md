# Phase 8: Delete Merged Branches

Date: 2026-07-29

## Scope

Delete branches already merged into `origin/main`, while preserving unmerged work, the active public intake PR branch, and live worktree directories.

## Starting Candidates

Local branches merged into `origin/main`:

- `codex-seller-onboarding-mobile-phases`
- `codex/main-reconciliation-20260728`
- `codex/seller-portal-activation-prod`
- `codex/storage-policy-token-proof`
- `codex/transaction-spine-release-contained`
- `main`

Remote branches merged into `origin/main`:

- `origin/agent/restore-seller-onboarding-welcome`
- `origin/codex-seller-onboarding-mobile-phases`
- `origin/codex/main-reconciliation-20260728`
- `origin/codex/production-signing-flow`
- `origin/codex/seller-portal-activation-prod`
- `origin/codex/storage-policy-token-proof`
- `origin/codex/transaction-spine-release-contained`
- `origin/main`

Protected from deletion:

- `main`
- `origin/main`
- `codex/agency-public-intake-pr`
- all unmerged branches
- live worktree directories

## Local Branches Deleted

Deleted with:

```bash
git branch -d codex-seller-onboarding-mobile-phases codex/storage-policy-token-proof codex/transaction-spine-release-contained
```

Deleted local branches:

- `codex-seller-onboarding-mobile-phases`
- `codex/storage-policy-token-proof`
- `codex/transaction-spine-release-contained`

## Remote Branches Deleted

Deleted with:

```bash
git push origin --delete agent/restore-seller-onboarding-welcome codex-seller-onboarding-mobile-phases codex/production-signing-flow codex/storage-policy-token-proof codex/transaction-spine-release-contained codex/seller-portal-activation-prod codex/main-reconciliation-20260728
```

Deleted remote branches:

- `origin/agent/restore-seller-onboarding-welcome`
- `origin/codex-seller-onboarding-mobile-phases`
- `origin/codex/production-signing-flow`
- `origin/codex/storage-policy-token-proof`
- `origin/codex/transaction-spine-release-contained`
- `origin/codex/seller-portal-activation-prod`
- `origin/codex/main-reconciliation-20260728`

## Local Branches Preserved

These local merged branches were not deleted because they are checked out in live worktrees:

| Branch | Worktree |
| --- | --- |
| `codex/seller-portal-activation-prod` | `/private/tmp/seller-activation-prod` |
| `codex/main-reconciliation-20260728` | `/private/tmp/the-it-guy-main-reconciliation-20260728` |

Reason:

Git marks these branches with `+` in `git branch --merged origin/main`, meaning they are checked out in another worktree. Deleting them safely requires an explicit live-worktree removal step first.

## Final Verification

After `git fetch origin --prune`:

Remote branches merged into `origin/main`:

- `origin/HEAD -> origin/main`
- `origin/main`

Local branches still merged into `origin/main`:

- `codex/main-reconciliation-20260728`
- `codex/seller-portal-activation-prod`
- `main`

Remaining merged local branches are intentionally preserved because two are checked out in live worktrees and `main` is protected.

## Final Repository State

- Current branch: `codex/agency-public-intake-pr`
- Public intake PR branch preserved
- No unmerged branches deleted
- No live worktree directories deleted
- Remote merged branch cleanup complete

## Recommended Next Phase

If we want a completely clean local branch list, perform a dedicated live-worktree removal phase for:

- `/private/tmp/seller-activation-prod`
- `/private/tmp/the-it-guy-main-reconciliation-20260728`

After those worktrees are removed, the remaining local merged branches can be deleted safely.
