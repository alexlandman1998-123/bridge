# Attorney MVP staging execution — 8 September 2026

## Authorised live write test

The user authorised assigning one staging demo matter. Transfer assignment `815b2e1e-9489-4898-ba0b-7106f6a901e6` on demo matter `b27fc192-b5ff-471b-9da5-902409f78116` was reassigned from `254b6403-d6a6-4302-b139-344561203c79` to demo attorney `5e8f930b-aa84-46a2-8aa6-288542748d7e` (both attorney ID fields). Firm, role, capabilities, bond/cancellation assignments and production were unchanged.

Browser completion initially exposed a second defect: the legacy `transaction_events_visibility_scope_check` accepted only shared/internal, rejecting the atomic RPC's professional_shared event. The entire mutation rolled back; the UI correctly displayed the error. Applied staging migration `20260908091504_attorney_event_visibility_contract` to preserve legacy values and allow explicit professional_shared/client_visible values. No access policies were changed. Updated the isolated SQL regression fixture to reproduce the legacy constraint before applying the compatibility migration; tests passed. Security advisors were rerun; this does not clear the existing unrelated findings.

Retried through the actual authenticated browser: Guarantees Requested was saved completed, the lane advanced to Guarantees Received, Work changed from 5/8 to 6/8, header displayed the new completion date, and dashboard progress increased from 70% to 73%. Navigating back to the matter retained completion. Task and published-progress events both stored professional_shared; client sharing was unchecked.

Reopen was then submitted through the browser and saved not_started, returning the lane to Guarantees Requested. These are actual live mutation results, not administrator-written task statuses. The assignment remains with the demo attorney for further testing. Full cross-role/client and six-profile live acceptance is still outstanding; historical NO GO findings below are retained for audit.

After reopen and navigation back to the dashboard, progress returned to **70%**, completing the observed 70% → 73% → 70% test. The test left the task reopened (not_started), not artificially completed. Four professional_shared events and zero client_visible events were recorded during the test window. Post-save refresh took noticeably longer than the database commit; this remains a usability concern, not a failed persistence assertion.

Decision: **NO GO for live pilot. Authentication and deployment passed; workflow acceptance did not.**

## Follow-up fix

Authenticated execution of the real workflow service exposed the exception: `(items || []).filter is not a function` in `scopeAttorneyWorkflowOperations`. The resolver's `dataRequirements` is a lane-keyed object, but permission scoping treated it as an array. Corrected scoping preserves the object shape and filters its lane keys without broadening access. A regression test uses the real resolver for denied, single-lane and multi-lane scopes.

After correction, the real staging attorney service returns 37 transfer tasks, 26 completed, 70% progress, with `instruction_received=completed`. Added visible modal/footer errors, removed the silent operations-loading catch, and replaced a missing Work lane with a retryable unavailable state. No new migration is needed for this JavaScript failure.

Corrected Vite preview: https://bridge-6km6h04oe-alexs-projects-f5496a21.vercel.app — deployment `dpl_DcJBRv7sGDSkSvZ61j7CL14ms9JA`, READY, base commit unchanged plus the three corrected source files. Build completed in approximately two minutes (excluding upload). No production promotion or git push.

Browser verification on this preview succeeded: Work shows stages 1/2/3 at 5/5, 7/7 and 9/9; Documents & Guarantees at 5/8, with Guarantees Requested in progress. Header shows saved completion dates for Instruction Received and subsequent completed tasks, not the former fabricated In Progress state. Returning to the dashboard shows 70%. No browser JavaScript errors were reported. Scoped-load, task-state, six-scenario acceptance, discretion and isolated PostgreSQL tests passed.

**Live mutation remains untested on this preview:** the authenticated demo account has read-only access to this demo matter; the correctly loaded permissions remove mutation actions. A read-only assignment query confirms no rows directly assigned to this account's user ID. An authorised editable staging fixture is needed to finish browser write/reload and cross-role tests. No assignment, permission, task status or client communication was changed to bypass this restriction. The original loading defect is fixed; the broader pilot gate remains NO GO until the outstanding live tests pass.

## Scope and deployment

- Staging only: `vaszuxjeoajeuhlcnzzf` (Arch9 Staging). No production account, matter, migration or deployment was changed.
- Managed physical backup `1610634649`, completed, inserted `2026-09-08T04:14:50.660Z`, was verified before migration. No restore drill was performed. A supplementary pg_dump timed out and produced an empty file; it is not a usable backup.
- Applied only migrations `20260908071547_attorney_mvp_atomic_task_progress` and `20260908073924_attorney_mvp_task_discretion`, preserving their original version history. Remote history was fetched into a temporary scoped migration directory; no ledger repair or broad database push was performed.
- Matching protected preview: https://bridge-ilisxc30z-alexs-projects-f5496a21.vercel.app
- Deployment `dpl_AZXoSc1ER5dhbhviZYJWkzYeNNSc`, READY. Snapshot based on `6823d4b388ea5152b3f367c6d84c5d1f6eb59353` with 15 attorney source overlays. This is not a new git commit. Unrelated DevelopmentDetail changes were excluded.
- Browser entry bundle verified to contain the staging Supabase URL. Deployment-specific email credentials were blanked and Property24/bond-intake email flags disabled. This is not evidence that every database-side notification integration is disabled.
- User explicitly authorised resetting only `attorney.demo@arch9.co.za` to the locally supplied password. Reset and actual browser sign-in succeeded. No password or session token is included here.

## Verification completed

- Remote build and deployment guards passed.
- Local scenario acceptance: 311 task/scenario checks, 1,244 outcome checks across six profiles passed. These are model tests, not live role acceptance.
- Isolated PostgreSQL discretion/atomic tests passed, including privilege assertions.
- Post-deployment function privileges verified: lifecycle recomputation helper inaccessible to anon/authenticated; authenticated task/reconciliation RPCs inaccessible to anon. Existing unrelated security advisor findings remain; staging is not security-certified.
- Authenticated attorney dashboard loaded, including horizontally scrollable cards and persisted progress values.

## Live acceptance failure

Verified demo matter: `b27fc192-b5ff-471b-9da5-902409f78116` (`is_demo_data=true`), MAT-1198, 18 Jacaranda Crescent, bond/individual.

| Surface | Observed |
| --- | --- |
| Database transfer task `instruction_received` | `completed`, updated 21 August 2026 |
| Work | Instruction Received: Not Started; stage 1: 0/5 |
| Header journey | Instruction Received: In Progress |
| Header stage | Lodgement |
| Dashboard before entering matter | 70% |

Clicked Complete task, entered an explicit staging-test note, left client sharing unchecked, and clicked Update status. The modal remained open. No task-update RPC appeared in captured requests; the database task timestamp stayed unchanged. Do not interpret the pre-existing completed database row as successful completion of this test.

Relevant source paths found during diagnosis:

- `AttorneyTransactionDetail.jsx` loads operations using `getAttorneyWorkflowOperationsForTransaction(...).catch(() => null)`, suppressing the loading error.
- `handleArchlineLegalWorkflowStepUpdate` returns false without an error if the workflow lane is missing.
- Workflow error state is declared with its value discarded (`const [, setWorkflowError]`), so failures set there cannot be displayed through that state.
- Captured staging requests returned 404 for `transaction_matter_health`, `transfer_firm_allocation_lifecycle_v2`, and `attorney_lane_delegations`. These establish additional schema/API gaps, but do not alone prove which dependency caused the missing workflow state.

## Required next

1. Surface the actual operations-loading exception and identify its failing dependency. Reconcile only the necessary staging schema prerequisites after review; do not apply all pending migrations blindly.
2. Prevent a missing/failed lane load from appearing as an actionable all-zero workflow; display an explicit loading/error state with retry. Show save failures in the task modal.
3. Repeat the demo completion test and verify persisted task, lane, lifecycle, history, header and dashboard, including reload.
4. Exercise external completion, not-applicable, reopen, capture/upload destinations, and all six profiles across transfer/bond/cancellation.
5. Test independently authenticated professional and client views. Cross-role refresh, opt-in client communication and live permission enforcement remain unverified.

No pilot approval, production promotion, commit or push was performed.
