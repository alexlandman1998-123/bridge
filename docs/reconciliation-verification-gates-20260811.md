# Verification Gates - 2026-08-11

## Purpose

Every accepted reconciliation batch must pass targeted verification before the next branch is merged or cherry-picked.

Batch verification is run with:

```bash
npm run reconcile:verify -- <batch-name>
```

The runner is implemented at:

`scripts/reconciliation-verify-batch.mjs`

## Batch Names

Use these batch names during the first reconciliation pass:

| Batch | Command |
| --- | --- |
| PR #12 seller-process closeout | `npm run reconcile:verify -- seller-process-next-action-fix` |
| Reminder health controls | `npm run reconcile:verify -- reminder-health-controls` |
| Attorney access permission bootstrap | `npm run reconcile:verify -- arch9-attorney-access-permission-bootstrap` |
| Phase 0 closeout evidence | `npm run reconcile:verify -- phase0-closeout-evidence` |
| Buyer onboarding projection recovery | `npm run reconcile:verify -- recover-buyer-onboarding-projection` |
| HQ owner dashboard | `npm run reconcile:verify -- hq-owner-dashboard` |
| Final PR smoke | `npm run reconcile:verify -- final-smoke` |

## Runner Behavior

Every batch run:

1. Prints the current branch status.
2. Scans for unresolved conflict markers in tracked files.
3. Runs the targeted tests for that batch.
4. Runs `npm run build` for app-impacting batches.
5. Exits non-zero on the first failed command.

## Verification Evidence Log

Record each batch result here as reconciliation progresses.

| Date | Batch | Commit | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-08-11 | `seller-process-next-action-fix` | working tree | Passed | `npm run reconcile:verify -- seller-process-next-action-fix` |

## Batch-Specific Verification

### `seller-process-next-action-fix`

Purpose:

Confirms PR #12 is safely superseded by current integration work.

Commands:

```bash
cd the-it-guy
node scripts/seller-process-workspace-panel-phase8.test.mjs
node scripts/seller-process-panel-action-routing-phase9.test.mjs
```

### `reminder-health-controls`

Purpose:

Confirms the reminder health controls migration and test are valid.

Commands:

```bash
cd the-it-guy
node scripts/notification-automation-reminder-health-controls.test.mjs
npm run build
```

### `arch9-attorney-access-permission-bootstrap`

Purpose:

Confirms attorney workspace permission bootstrap still resolves expected workspace state.

Commands:

```bash
cd the-it-guy
node src/services/__tests__/workspaceResolutionService.test.js
npm run build
```

### `phase0-closeout-evidence`

Purpose:

Confirms Phase 0 guard retirement after explicit approval.

Commands:

```bash
node scripts/supabase-phase0-retirement.test.mjs
node scripts/supabase-phase8-closeout.test.mjs
cd the-it-guy
npm run build
```

### `recover-buyer-onboarding-projection`

Purpose:

Confirms buyer onboarding projection recovery behavior after conflict resolution.

Commands:

```bash
cd the-it-guy
node scripts/buyer-onboarding-projection-recovery-contract.test.mjs
node scripts/mandate-readiness-canonical-facts.test.mjs
node scripts/seller-onboarding-progress-serialization.test.mjs
npm run build
```

### `hq-owner-dashboard`

Purpose:

Confirms bond HQ owner dashboard behavior after UI/test conflicts are resolved.

Commands:

```bash
cd the-it-guy
node src/components/bond/__tests__/BondDashboard.test.jsx
npm run build
```

### `final-smoke`

Purpose:

Confirms the reconciliation branch is ready for a draft PR.

Commands:

```bash
cd the-it-guy
npm test
npm run build
```

## Failure Rule

If any verification command fails:

- stop merging
- keep the failing batch as the active batch
- fix or revert only the batch that failed
- rerun the same batch verification
- record the final result before moving on

## PR Requirement

The reconciliation PR body must include:

- each batch name
- verification command
- pass/fail result
- any skipped commands and why
