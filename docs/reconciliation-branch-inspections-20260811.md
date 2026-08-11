# Branch Inspection Register - 2026-08-11

## Baseline

Integration branch:

`codex/reconcile-unmerged-branches-20260811`

Baseline commit:

`f5cb297cc220a2605c9c7840ba94ddad99c934ca`

## Inspection Procedure

Batch verification commands and evidence rules are tracked in `docs/reconciliation-verification-gates-20260811.md`.

Before merging any candidate branch:

1. Confirm unique commits:

   ```bash
   git log --oneline HEAD..origin/<branch>
   git rev-list --left-right --count HEAD...origin/<branch>
   ```

2. Review changed files:

   ```bash
   git diff --name-status HEAD...origin/<branch>
   git diff --stat HEAD...origin/<branch>
   ```

3. Simulate merge conflicts without touching the worktree:

   ```bash
   git merge-tree --write-tree HEAD origin/<branch>
   ```

4. Record one decision:

   - merge
   - merge after conflict resolution
   - gated pending approval
   - cherry-pick only
   - skip as superseded
   - defer to last pass

## First-Pass Candidate Inspections

### `codex/reminder-health-controls`

Counts:

`main_ahead=182`, `branch_ahead=1`

Unique branch commit:

`240c53d9 Complete reminder health controls`

Changed files:

- `supabase/migrations/202607310007_notification_automation_reminder_health_controls.sql`
- `the-it-guy/scripts/notification-automation-reminder-health-controls.test.mjs`

Merge simulation:

Clean.

Decision:

Merged in Phase 3.

Verification:

```bash
cd the-it-guy
node scripts/notification-automation-reminder-health-controls.test.mjs
npm run build
```

Result:

Passed via `npm run reconcile:verify -- reminder-health-controls`.

Merge commit:

`01f71efe`

### `codex/arch9-attorney-access-permission-bootstrap`

Counts:

`main_ahead=103`, `branch_ahead=1`

Unique branch commit:

`f3b2d6ff Fix attorney workspace permission bootstrap`

Changed files:

- `the-it-guy/src/hooks/useAttorneyPermissions.js`
- `the-it-guy/src/services/__tests__/workspaceResolutionService.test.js`
- `the-it-guy/src/services/workspaceResolutionService.js`

Merge simulation:

Conflict.

Conflict files:

- `the-it-guy/src/hooks/useAttorneyPermissions.js`

Decision:

Merged in Phase 4 after resolving the limited hook conflict.

Verification:

```bash
cd the-it-guy
node src/services/__tests__/workspaceResolutionService.test.js
npm run build
```

Result:

Passed via `npm run reconcile:verify -- arch9-attorney-access-permission-bootstrap`.

Conflict resolution:

The current integration branch already included the attorney-firm workspace fallback plus newer boot-membership context handling in `the-it-guy/src/hooks/useAttorneyPermissions.js`. The resolution kept the current implementation, removed duplicate fallback code from the incoming branch, and completed the merge with no net tree change.

Merge commit:

`13729f02`

### `codex/phase0-closeout-evidence`

Counts:

`main_ahead=170`, `branch_ahead=2`

Unique branch commits:

- `d26db9b2 Refresh live Supabase closeout evidence`
- `eb108368 Retire Phase 0 broad-push guard`

Changed files summary:

- removes `.github/workflows/supabase-phase0-guard.yml`
- removes `scripts/supabase-phase0-guard.mjs`
- removes `scripts/supabase-phase0-guard.test.mjs`
- removes `scripts/supabase-phase0-migration-freeze.mjs`
- adds `scripts/supabase-phase0-retirement.test.mjs`
- updates Supabase closeout reports and package scripts

Merge simulation:

Conflict.

Conflict files:

- `package.json`

Decision:

Gated pending explicit approval to retire the Phase 0 Supabase broad-push guard.

If approved, resolve `package.json` by keeping current `main` scripts and adding:

```json
"test:supabase-phase0-retirement": "node scripts/supabase-phase0-retirement.test.mjs"
```

Verification:

```bash
node scripts/supabase-phase0-retirement.test.mjs
node scripts/supabase-phase8-closeout.test.mjs
cd the-it-guy
npm run build
```

### `codex/recover-buyer-onboarding-projection-20260801`

Counts:

`main_ahead=149`, `branch_ahead=1`

Unique branch commit:

`926efe4e test`

Changed files summary:

- adds buyer onboarding projection recovery migration
- adds recovery contract and staging smoke scripts
- updates mandate readiness facts
- updates seller onboarding and private listing flows
- modifies `the-it-guy/src/lib/api.js`

Merge simulation:

Conflict.

Conflict files:

- `the-it-guy/scripts/seller-portal-alignment.test.mjs`
- `the-it-guy/src/lib/api.js`

Decision:

Merged in Phase 6 after manual conflict resolution and focused review of `api.js`.

Verification:

```bash
cd the-it-guy
node scripts/buyer-onboarding-projection-recovery-contract.test.mjs
node scripts/mandate-readiness-canonical-facts.test.mjs
node scripts/seller-onboarding-progress-serialization.test.mjs
npm run build
```

Result:

Passed via `npm run reconcile:verify -- recover-buyer-onboarding-projection`.

Conflict resolution:

The resolution combined the incoming projection recovery failure-marker behavior with the current richer buyer information-sheet capture, completion hook, bond handoff, attorney handoff, and workflow-evidence flow. The buyer projection recovery contract was updated to assert the current `updateTransactionRequiredDocumentCaptureIfPossible` helper for information-sheet save and replay behavior.

Merge commit:

`f37228dc`

### `codex/hq-owner-dashboard`

Counts:

`main_ahead=237`, `branch_ahead=1`

Unique branch commit:

`9c0cd2b5 Refactor bond owner dashboard`

Changed files:

- `the-it-guy/src/components/bond/BondDashboard.jsx`
- `the-it-guy/src/components/bond/BondHqCommandCentre.jsx`
- `the-it-guy/src/components/bond/__tests__/BondDashboard.test.jsx`
- `the-it-guy/src/services/bondCommandCenterService.js`

Merge simulation:

Conflict.

Conflict files:

- `the-it-guy/src/components/bond/BondHqCommandCentre.jsx`
- `the-it-guy/src/components/bond/__tests__/BondDashboard.test.jsx`

Decision:

Reconciled in Phase 6. The current integration branch already had a richer HQ management dashboard than the incoming tabbed owner-dashboard refactor, so the merge records the branch while keeping the current dashboard UI and test implementation.

Verification:

```bash
cd the-it-guy
node src/components/bond/__tests__/BondDashboard.test.jsx
npm run build
```

Result:

Passed via `npm run reconcile:verify -- hq-owner-dashboard`.

Conflict resolution:

Kept the current versions of `the-it-guy/src/components/bond/BondHqCommandCentre.jsx` and `the-it-guy/src/components/bond/__tests__/BondDashboard.test.jsx`.

Merge commit:

`06eca9a7`

## Open PR Inspection Results

### `codex/seller-process-next-action-fix`

PR:

`#12 Fix Kingstons next best action mismatch`

Status:

Closed as superseded during reconciliation.

Inspection result:

Current `main` already carries the intended seller-process next-action behavior. The integration branch only updates stale contract-test source boundaries so the tests inspect the current `AgentLeadsPage.jsx` structure.

Verification completed:

```bash
cd the-it-guy
node scripts/seller-process-workspace-panel-phase8.test.mjs
node scripts/seller-process-panel-action-routing-phase9.test.mjs
```

Decision:

Do not merge stale branch.

### `codex/phase0-closeout-evidence`

PR:

`#11 Retire Phase 0 broad-push guard`

Status:

Open and gated.

Inspection result:

Technically resolvable, but requires explicit approval because it removes the Phase 0 Supabase broad-push guard.

Decision:

Do not merge until approval is recorded.

## Deferred Branch Inspection Notes

Detailed last-pass handling rules are tracked in `docs/reconciliation-last-pass-branches-20260811.md`.

### `codex/integrate-production-evidence-catchup-20260801`

Counts:

`main_ahead=149`, `branch_ahead=21`

Inspection result:

High value but broad. Prior dry-run conflict scan found conflicts across auth bootstrap, onboarding branding, legal document workspace, packet service, and private listing service.

Decision:

Defer. Cherry-pick by theme only.

### `codex/seller-first-contact-reload`

Counts:

`main_ahead=2`, `branch_ahead=14`

Inspection result:

Broad surface area across seller, buyer, attorney, commission, dashboard, and workflow code.

Decision:

Defer to a separate reconciliation project.

## Required Update Discipline

When a branch is merged, skipped, or deferred, update this register in the same commit as the reconciliation change.
