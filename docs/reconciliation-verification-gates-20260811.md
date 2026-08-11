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

## Phase 4 Execution

Phase 4, `Second Branch Batch`, is complete as of `2026-08-11 17:15:37 SAST`.

Merged branch:

`origin/codex/arch9-attorney-access-permission-bootstrap`

Merge commit:

`13729f02`

Conflict resolution:

- `the-it-guy/src/hooks/useAttorneyPermissions.js` had the expected conflict.
- The integration branch already had the richer boot-membership logic and the branch's attorney-firm workspace fallback.
- The resolution kept the integration branch implementation and removed duplicate fallback code, so the merge commit records reconciliation with no net tree change.

Verification:

```bash
npm run reconcile:verify -- arch9-attorney-access-permission-bootstrap
```

Result: passed. The workspace resolution service test passed and `npm run build` completed successfully.

## Phase 5 Execution

Phase 5, `Guarded Phase 0 Closeout Review`, remains gated as of `2026-08-11 17:28:25 SAST`.

Reviewed branch:

`origin/codex/phase0-closeout-evidence`

Decision:

Do not merge until explicit guard-retirement approval is recorded. The branch removes the Phase 0 Supabase broad-push guard workflow and scripts, so it remains policy-sensitive even though the technical conflict is limited.

## Phase 6 Execution

Phase 6, `Recent High-Value Recovery Batch`, is complete as of `2026-08-11 17:28:25 SAST`.

Merged branches:

- `origin/codex/recover-buyer-onboarding-projection-20260801`
- `origin/codex/hq-owner-dashboard`

Merge commits:

- `f37228dc` - buyer onboarding projection recovery
- `06eca9a7` - HQ owner dashboard

Conflict resolution:

- `the-it-guy/scripts/seller-portal-alignment.test.mjs`: kept the current shared branding resolver assertions and accepted the incoming lightweight-core payload assertion.
- `the-it-guy/src/lib/api.js`: kept the current richer information-sheet capture/completion-hook/bond/attorney handoff flow, added projection failure markers around replay steps, and aligned the buyer projection contract with the current required-document capture helper.
- `the-it-guy/src/components/bond/BondHqCommandCentre.jsx`: kept the current richer management dashboard implementation because it superseded the incoming tabbed owner-dashboard refactor.
- `the-it-guy/src/components/bond/__tests__/BondDashboard.test.jsx`: kept the current dashboard test coverage aligned to the current implementation.

Verification:

```bash
npm run reconcile:verify -- recover-buyer-onboarding-projection
npm run reconcile:verify -- hq-owner-dashboard
```

Result: both passed. Each batch ran its focused test set and `npm run build` completed successfully.

## Phase 7 Execution

Phase 7, `Final Integration Smoke`, is complete as of `2026-08-11 17:33:03 SAST`.

Verification:

```bash
npm run reconcile:verify -- final-smoke
```

Expanded commands:

```bash
cd the-it-guy
npm test
npm run build
```

Result: passed. The broad service test chain completed successfully and `npm run build` completed successfully with the existing Vite chunk-size and mixed dynamic/static import warnings only.

Deployment decision:

No deployment is authorized from this phase. PR #13 checks must be green, the PR must be ready and merged into `main`, and the fail-closed deploy gate must pass before production deployment.

## Phase 8 Execution

Phase 8, `Deployment Readiness Gate`, is complete as of `2026-08-11 17:35:44 SAST`.

Live PR #13 check state at completion:

- `Supabase Phase 0 Guard`: passed
- `Supabase Phase 6 Staging Gate`: passed
- `Supabase Phase 7 Production Gate`: passed
- `Supabase Phase 8 Closeout Gate`: passed
- `Supabase Preview`: skipped
- `Vercel Preview Comments`: passed
- `Vercel - bridge`: passed
- `Vercel - bridge-admin`: passed

Deploy gate:

```bash
npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge
```

Result: blocked as expected because PR #13 remains draft. No production deployment is authorized from the reconciliation branch.

Required before deployment:

- mark PR #13 ready for review
- keep all GitHub checks and Vercel statuses green
- merge PR #13 into `main`
- rerun the fail-closed deploy gate against the merged deployment candidate

## Phase 9 Execution

Phase 9, `Ready for Merge and Production Handoff`, started as of `2026-08-11 17:39:51 SAST`.

PR transition:

- PR #13 was marked ready for review.
- The draft blocker was removed.
- The pre-merge deploy gate passed against the then-current head.

Pre-merge deploy gate:

```bash
npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge
```

Result: passed with all PR checks and Vercel statuses green after PR #13 was marked ready for review.

Phase 9 guardrail:

Before merging or allowing production handoff, rerun the live PR checks and fail-closed deploy gate against the latest pushed head. If this Phase 9 evidence commit restarts checks, wait for those checks before merge.

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
| 2026-08-11 | `arch9-attorney-access-permission-bootstrap` | `13729f02` | Passed | `npm run reconcile:verify -- arch9-attorney-access-permission-bootstrap` |
| 2026-08-11 | `phase0-closeout-evidence` | not merged | Gated | Explicit guard-retirement approval not recorded |
| 2026-08-11 | `recover-buyer-onboarding-projection` | `f37228dc` | Passed | `npm run reconcile:verify -- recover-buyer-onboarding-projection` |
| 2026-08-11 | `hq-owner-dashboard` | `06eca9a7` | Passed | `npm run reconcile:verify -- hq-owner-dashboard` |
| 2026-08-11 | `final-smoke` | `ba683a9a` | Passed | `npm run reconcile:verify -- final-smoke` |
| 2026-08-11 | `deploy-gate-final` | `cc471c6c` | Blocked as expected | `npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge` found all checks green and PR #13 still draft |
| 2026-08-11 | `deploy-gate-ready` | `7f449bd2` | Passed | `npm run reconcile:deploy-gate -- --pr 13 --repo alexlandman1998-123/bridge` passed after PR #13 was marked ready for review |

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
