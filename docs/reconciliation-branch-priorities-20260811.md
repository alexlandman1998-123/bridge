# Branch Priority Register - 2026-08-11

## Context

This register prioritizes unmerged branch work for `codex/reconcile-unmerged-branches-20260811`.

Inspection evidence is tracked in `docs/reconciliation-branch-inspections-20260811.md`.

Last-pass deferrals are tracked in `docs/reconciliation-last-pass-branches-20260811.md`.

Verification gates are tracked in `docs/reconciliation-verification-gates-20260811.md`.

Current baseline:

`origin/main` at `f5cb297cc220a2605c9c7840ba94ddad99c934ca`

## Priority Rules

Prioritize branches that are:

- recent enough to still match current product direction
- focused enough to verify with targeted tests
- high value for production stability, onboarding, reminders, permissions, or dashboards
- low enough risk to merge before broad Kingstons, MVP, WIP, or database-reconciliation branches

Do not merge a branch wholesale just because it has a useful commit. If a branch is broad, stale, or conflicts across production-critical areas, cherry-pick only named commits after inspection.

## First-Pass Queue

### 1. `codex/reminder-health-controls`

Status: ready for first merge.

Why:

- one commit
- two files
- clean merge simulation
- adds reminder health controls migration and test

Verification:

```bash
cd the-it-guy
node scripts/notification-automation-reminder-health-controls.test.mjs
npm run build
```

### 2. `codex/arch9-attorney-access-permission-bootstrap`

Status: high priority, conflict resolution required.

Why:

- one commit
- three files
- fixes attorney workspace permission bootstrap
- conflict is limited to `the-it-guy/src/hooks/useAttorneyPermissions.js`

Verification:

```bash
cd the-it-guy
node src/services/__tests__/workspaceResolutionService.test.js
npm run build
```

### 3. `codex/phase0-closeout-evidence`

Status: gated by Phase 0 guard-retirement approval.

Why:

- already tracked by PR #11
- technically small conflict in root `package.json`
- policy-sensitive because it removes the Phase 0 broad-push guard workflow and scripts

Do not merge until guard retirement is explicitly approved.

Verification if approved:

```bash
node scripts/supabase-phase0-retirement.test.mjs
node scripts/supabase-phase8-closeout.test.mjs
cd the-it-guy
npm run build
```

### 4. `codex/recover-buyer-onboarding-projection-20260801`

Status: high value, conflict resolution required.

Why:

- one commit
- restores buyer onboarding projection recovery coverage
- conflicts are limited but include `the-it-guy/src/lib/api.js`, so inspect carefully

Verification:

```bash
cd the-it-guy
node scripts/buyer-onboarding-projection-recovery-contract.test.mjs
node scripts/mandate-readiness-canonical-facts.test.mjs
node scripts/seller-onboarding-progress-serialization.test.mjs
npm run build
```

### 5. `codex/hq-owner-dashboard`

Status: useful, conflict resolution required.

Why:

- one commit
- focused bond HQ dashboard changes
- conflicts in dashboard UI and tests

Verification:

```bash
cd the-it-guy
node src/components/bond/__tests__/BondDashboard.test.jsx
npm run build
```

## Resolved Open PR Work

### `codex/seller-process-next-action-fix`

Status: closed as superseded by PR #12.

Why:

- current `main` already contains the seller-process next-action behavior
- the reconciliation branch updated stale test source-slice boundaries
- both targeted seller-process contracts pass on the integration branch

Verification completed:

```bash
cd the-it-guy
node scripts/seller-process-workspace-panel-phase8.test.mjs
node scripts/seller-process-panel-action-routing-phase9.test.mjs
```

Do not merge the stale branch wholesale.

## Deferred Last-Pass Branches

### `codex/integrate-production-evidence-catchup-20260801`

Status: defer; cherry-pick by theme only.

Why:

- 21 commits
- 56 files
- conflicts across auth, legal documents, onboarding, packet services, and private listings

### `codex/seller-first-contact-reload`

Status: defer as separate reconciliation project.

Why:

- 82 files
- broad seller, buyer, attorney, commission, and dashboard surface area
- too large for the first pass

### `codex/kingston-seller-process-release`

Status: defer; extract missing pieces only.

Why:

- high product value, but older than current seller-process work
- likely partially superseded by current `main`

### `codex/mvp-pilot-readiness`

Status: defer.

Why:

- closed draft PR lineage
- 134 branch-ahead commits
- too broad for this reconciliation pass

### `codex/arch9-mvp-release`

Status: defer.

Why:

- broad release branch
- 36 branch-ahead commits and far behind current `main`

### `codex/db-phase0-reconciliation`

Status: defer.

Why:

- old database reconciliation branch
- migration risk is too high for first pass

### `codex-document-access-permissions-phase7`

Status: defer.

Why:

- stale access-permission branch
- 16 branch-ahead commits and far behind current `main`

### `codex/wip-*`

Status: defer or archive after confirmation.

Why:

- WIP/archive naming
- not suitable for wholesale integration

## Optional Low-Risk Candidates

### `codex/bond-demo-applications-seed-20260728`

Status: optional.

Why:

- one standalone seed script
- merge only if demo bond application seeding is still wanted

### `codex/produktive-agent-provisioning`

Status: optional after current behavior check.

Why:

- small env/Supabase key handling branch
- old enough that current `main` may already cover the behavior

## Re-Evaluation Triggers

Revisit priority if:

- a production incident maps directly to a deferred branch
- `main` receives a hotfix during the freeze
- a first-pass merge creates unexpected conflicts
- branch-specific tests reveal that a supposedly superseded branch still carries missing behavior
