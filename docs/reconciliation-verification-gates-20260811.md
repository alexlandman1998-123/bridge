# Verification Gates - 2026-08-11

## Purpose

Every accepted reconciliation batch must pass targeted verification before the next branch is merged or cherry-picked.

Batch verification is run with:

```bash
npm run reconcile:verify -- <batch-name>
```

The runner is implemented at:

`scripts/reconciliation-verify-batch.mjs`

## Phase 2 Execution

Phase 2, `Finish Current Checks`, is complete as of `2026-08-11 17:08:02 SAST`.

PR #13 check state at completion:

- `Supabase Phase 0 Guard`: passed
- `Supabase Phase 6 Staging Gate`: passed
- `Supabase Phase 7 Production Gate`: passed
- `Supabase Phase 8 Closeout Gate`: passed
- `Supabase Preview`: skipped
- `Vercel Preview Comments`: passed
- `Vercel - bridge`: passed
- `Vercel - bridge-admin`: passed

The deploy gate was run after the check rollup went green:

```bash
npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge
```

Result: blocked as expected because PR #13 remains draft. No deployment is authorized.

## Phase 3 Execution

Phase 3, `First Branch Batch`, is complete as of `2026-08-11 17:11:26 SAST`.

Merged branch:

`origin/codex/reminder-health-controls`

Merge commit:

`01f71efe`

Accepted files:

- `supabase/migrations/202607310007_notification_automation_reminder_health_controls.sql`
- `the-it-guy/scripts/notification-automation-reminder-health-controls.test.mjs`

Verification:

```bash
npm run reconcile:verify -- reminder-health-controls
```

Result: passed. The reminder-health controls test passed and `npm run build` completed successfully.

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
| 2026-08-11 | `deploy-gate` | working tree | Blocked as expected | `npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge` found PR #13 is still draft |
| 2026-08-11 | `phase-2-current-checks` | working tree | Passed with deployment blocked | GitHub and Vercel checks for PR #13 were green; deploy gate blocked only because PR #13 remains draft |
| 2026-08-11 | `reminder-health-controls` | `01f71efe` | Passed | `npm run reconcile:verify -- reminder-health-controls` |

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

## Deployment Gate

Do not deploy from the reconciliation branch. Production deployment may proceed only after the reconciliation PR has green GitHub checks and green Vercel statuses, has merged into `main`, and the production build is tied to that merged commit.

Use the fail-closed deploy gate before marking the reconciliation PR deploy-ready:

```bash
npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge
```

The gate blocks deploy readiness when:

- the PR is draft
- any GitHub check run is pending, cancelled, failed, timed out, or action-required
- any status context, including Vercel, is pending, failed, or errored
- GitHub returns no check rollup
