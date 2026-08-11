# Reconciliation Freeze - 2026-08-11

## Status

Active soft freeze for branch reconciliation.

## Purpose

Keep `main` stable while unmerged branch work is inspected, merged, skipped, or deferred through one controlled integration branch.

## Active Integration Branch

`codex/reconcile-unmerged-branches-20260811`

The branch starts from `origin/main` at:

`f5cb297cc220a2605c9c7840ba94ddad99c934ca`

## Freeze Rules

Do not start new feature branches or feature PRs during this reconciliation window.

Allowed work:

- conflict resolution for existing branch candidates
- targeted cherry-picks from inspected branches
- verification fixes required to keep the reconciliation branch green
- production hotfixes when they are urgent and explicitly called out
- documentation updates that support the reconciliation

Not allowed during the freeze:

- new feature branches unrelated to reconciliation
- broad refactors
- direct production deployment from unverified branch work
- wholesale merges of stale or high-risk branches
- database migration changes that have not passed the reconciliation review path

## Merge Discipline

Every candidate branch must be inspected before merge:

1. Confirm unique commits with `git log origin/main..origin/<branch>`.
2. Review changed files with `git diff --name-status origin/main...origin/<branch>`.
3. Simulate conflict risk with `git merge-tree --write-tree HEAD origin/<branch>`.
4. Decide one of:
   - merge
   - cherry-pick selected commits
   - skip as superseded
   - defer to last-pass review

## First-Pass Queue

Detailed branch prioritization is tracked in `docs/reconciliation-branch-priorities-20260811.md`.

Preferred order:

1. `codex/reminder-health-controls`
2. `codex/arch9-attorney-access-permission-bootstrap`
3. `codex/phase0-closeout-evidence`, only after guard-retirement approval
4. `codex/recover-buyer-onboarding-projection-20260801`
5. `codex/hq-owner-dashboard`

## Open PR Handling

PR #12, `codex/seller-process-next-action-fix`, is treated as superseded by current `main` plus reconciliation test-boundary updates. Do not merge the stale draft branch. The intended seller process contracts must pass on the integration branch instead:

```bash
cd the-it-guy
node scripts/seller-process-workspace-panel-phase8.test.mjs
node scripts/seller-process-panel-action-routing-phase9.test.mjs
```

PR #11, `codex/phase0-closeout-evidence`, remains blocked on explicit approval to retire the Phase 0 Supabase broad-push guard. If approved, resolve the root `package.json` conflict by keeping current `main` scripts and adding `test:supabase-phase0-retirement`.

## Last-Pass Queue

Detailed deferral rules are tracked in `docs/reconciliation-last-pass-branches-20260811.md`.

Do not merge these wholesale during the first pass:

- `codex/integrate-production-evidence-catchup-20260801`
- `codex/seller-first-contact-reload`
- `codex/kingston-seller-process-release`
- `codex/seller-process-next-action-fix`
- `codex/mvp-pilot-readiness`
- `codex/arch9-mvp-release`
- `codex/archive-phase39-baseline-20260723`
- `codex/db-phase0-reconciliation`
- `codex-document-access-permissions-phase7`
- `codex/wip-*`

## Verification Gate

Detailed verification commands and evidence rules are tracked in `docs/reconciliation-verification-gates-20260811.md`.

After each accepted batch:

```bash
git status --short --branch
cd the-it-guy
npm run build
```

Run branch-specific tests before moving to the next candidate. Before opening the reconciliation PR, run the broader app smoke:

```bash
cd the-it-guy
npm test
npm run build
```

Also confirm no unresolved conflict markers remain:

```bash
rg '<<<<<<<|=======|>>>>>>>' .
```

## Deployment Gate

Do not deploy production from the reconciliation branch directly.

Production deployment is allowed only after:

- the reconciliation PR is green
- Vercel preview is green
- branch-specific tests are documented
- the PR has merged into `main`
- Vercel production has built the merged `main` commit
- live release manifests match the merged commit

Before treating the reconciliation PR as deploy-ready, run:

```bash
npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge
```

The gate fails closed while the PR is draft, while any GitHub check or Vercel status is pending or failed, or when GitHub returns no check rollup. A blocked gate means no production deployment.

## Exit Criteria

The freeze can be lifted when:

- the reconciliation PR has merged or been intentionally closed
- deferred branches are documented
- live production release manifest matches `main`
- no urgent branch-sync concerns remain
