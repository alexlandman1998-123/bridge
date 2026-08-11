# Last-Pass Branch Register - 2026-08-11

## Purpose

This register keeps stale, broad, or high-risk branch work out of the first reconciliation pass.

The rule for every branch in this file:

Do not merge wholesale into `codex/reconcile-unmerged-branches-20260811`.

Allowed handling:

- defer
- skip as superseded
- cherry-pick named commits only after fresh inspection
- create a separate focused reconciliation branch later

## Re-Entry Criteria

A last-pass branch can move back into active reconciliation only when all of the following are true:

- a specific missing behavior is identified on current `main`
- the exact commit or file range that implements that behavior is named
- `git diff` confirms the change is focused enough to review
- `git merge-tree --write-tree HEAD origin/<branch>` or cherry-pick dry run is inspected
- branch-specific verification commands are identified before applying changes
- database migrations, if any, are reviewed separately

## Deferred Branches

### `codex/integrate-production-evidence-catchup-20260801`

Counts:

`main_ahead=149`, `branch_ahead=21`

Reason for deferral:

- broad production evidence branch
- conflicts across auth bootstrap, onboarding branding, legal document workspace, packet services, and private listing services
- high likelihood of partially superseded work

Allowed next step:

Cherry-pick by theme only, with one topic per reconciliation batch.

Suggested themes:

- mandate generation diagnostics
- auth bootstrap recovery
- packet status stability
- PostgREST schema cache diagnostics

### `codex/seller-first-contact-reload`

Counts:

`main_ahead=2`, `branch_ahead=14`

Reason for deferral:

- very broad surface area
- touches seller, buyer, attorney, commission, dashboard, workflow, and Vite config areas
- too large for the first reconciliation pass

Allowed next step:

Create a separate seller-first-contact reconciliation branch after the first-pass queue is complete.

### `codex/kingston-seller-process-release`

Counts:

`main_ahead=68`, `branch_ahead=14`

Reason for deferral:

- high product value but likely partially superseded by current seller-process work
- overlaps with PR #12 and later seller-process changes already present on `main`

Allowed next step:

Extract only missing Kingstons seller-process behavior after running the current seller-process Phase 8 and Phase 9 contracts on the integration branch.

### `codex/seller-process-next-action-fix`

Status:

Closed as superseded by PR #12.

Reason for deferral:

- stale draft PR branch
- intended contract passes on integration after test-boundary updates

Allowed next step:

None during first pass. Do not merge.

### `codex/mvp-pilot-readiness`

Counts:

`main_ahead=403`, `branch_ahead=134`

Reason for deferral:

- closed draft PR lineage
- very broad release branch
- too many unique commits for safe first-pass reconciliation

Allowed next step:

Separate MVP readiness audit only.

### `codex/arch9-mvp-release`

Counts:

`main_ahead=408`, `branch_ahead=36`

Reason for deferral:

- broad release branch
- far behind current `main`
- likely overlaps with existing release/certification work

Allowed next step:

Separate release-readiness comparison, not wholesale merge.

### `codex/archive-phase39-baseline-20260723`

Reason for deferral:

- archive/baseline branch
- not intended as active product work

Allowed next step:

Extract only a named missing test or artifact if one is proven absent from `main`.

### `codex/archive-dashboard-performance-20260723`

Reason for deferral:

- archive branch
- performance work may already be superseded by current baseline and performance budget checks

Allowed next step:

Compare only if the current dashboard performance budget regresses.

### `codex/db-phase0-reconciliation`

Counts:

`main_ahead=413`, `branch_ahead=27`

Reason for deferral:

- database reconciliation branch
- migration risk is too high for first pass
- old relative to current migration closeout state

Allowed next step:

Database-only reconciliation review with migration ledger checks.

### `codex-document-access-permissions-phase7`

Counts:

`main_ahead=461`, `branch_ahead=16`

Reason for deferral:

- stale access-permissions branch
- far behind current `main`
- likely overlaps with current attorney/access workspace changes

Allowed next step:

Compare only after `codex/arch9-attorney-access-permission-bootstrap` is reconciled.

### `codex/wip-arch9-migration-reconciliation-20260723`

Reason for deferral:

- WIP branch
- migration reconciliation topic
- not suitable for first-pass merge

Allowed next step:

Archive or inspect only during database-specific reconciliation.

### `codex/wip-shared-worktree-20260723`

Reason for deferral:

- WIP branch
- shared-worktree naming gives no focused product scope

Allowed next step:

Archive after confirmation unless a named missing commit is identified.

## First-Pass Guardrail

Before any merge, confirm the candidate is not listed in this file:

```bash
rg "origin/<branch>|`<branch>`" docs/reconciliation-last-pass-branches-20260811.md
```

If the branch appears here, do not merge it into the first-pass reconciliation branch.
