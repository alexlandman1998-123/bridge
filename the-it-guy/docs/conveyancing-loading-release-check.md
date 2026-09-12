# Conveyancing loading release check

Environment: staging only (`vaszuxjeoajeuhlcnzzf`). Production unchanged.
Release checkout: `/Users/alexanderlandman/conveyancing-release-20260911`.
Original workspace remains untouched.

Latest targeted result: [bond/cancellation acceptance](bond-cancellation-acceptance-20260912.md).
Both lanes now passed completed, N/A and reopened states through all five role reloads
(30 browser checks total). The seller session/reload fix retains a stored credential
unless the server explicitly confirms expiry. Original fixture outcomes/history were
restored. Release remains HOLD for the separate risks listed below.

Previous targeted result: [attorney reopen retest](attorney-reopen-retest-20260912.md)
passed on its second attempt across five fresh role views. The first attempt stopped
on an unexplained reconciliation error; attorney Work still took about 45 seconds.
This does not clear the full acceptance or loading-performance gate.

12 September follow-up: permission-query optimisation applied to staging. See
[permission query evidence](attorney-permission-query-optimisation-20260912.md).
The sampled 85-task query fell from 1,222 ms to 350–364 ms with matching access results.
Release remains HOLD: full browser acceptance and the separately identified pre-existing
empty-email permission edge case are not closed by that optimisation.

## Changes

- Workflow readiness now requires the completed workflow dataset load; lightweight route subprocess placeholders cannot suppress it.
- Forced dataset refreshes queue one subsequent read instead of superseding an unfinished read and starving initial rendering. Route scope changes discard queued work.
- Agent/developer views do not load attorney operation/permission bundles. Developer plan validation uses the persisted transaction plan where supplied; when lightweight route data omits it, the authorized reader's active-plan lane/task manifest is used. Missing/mismatched manifests and revisions still fail closed.
- Shared journey reads retry a transient failure once, with no retry for denied access or invalid input. No success snapshots are fabricated.
- Browser harness logs response timings and error codes without tokens. Test commands and cleanup retry transient failures with the same command identity.

## Evidence so far

- Isolated staging build succeeds; generated assets are excluded from the release.
- Serialization regression executes the page loader: initial result renders, concurrent forced signals coalesce, next read is fresh, read-only roles make no attorney operations call.
- Loading, permission, agent rendering, stable-rollup, scenario/tax, shared-reader and atomic-command regression tests passed.
- Initial five-role read-only reload passed. First mutation run reproduced attorney loading beyond 60 seconds on transfer N/A. Second candidate exposed the developer's dependency on the attorney-only plan loader, subsequently removed.
- The second run's cleanup encountered a transient fetch failure; the sixth fixture's completed outcome and empty original note were restored and verified through the authenticated command. Historical events were retained.

## Separate issues exposed by network diagnostics

- Two legacy sixth-fixture document paths return Storage `NoSuchKey` (registration confirmation and final account).
- Buyer direct participant-requirement request returns `42501`.
- Seller financial-account RPC returns `P0001`.
- Intermittent database/network latency remains observable. A successful bounded test is not a sustained-load guarantee.

These are not counted as passing full-portal acceptance. Missing seller/tax scenario facts also remain unconfirmed. Do not deploy until the final acceptance result and these remaining release risks are reviewed.

## Final acceptance result: HOLD

Follow-up on 2026-09-12: see `conveyancing-read-backpressure-20260912.md`. Client backpressure and duplicate permission-read fixes are retained; 14/15 transfer-role checks passed, but attorney reopen still encountered a task-table statement timeout. The full three-lane matrix remains incomplete. A tested global transport cap was removed after worse live results.

The final isolated build passed, as did the loader serialization, high-level integration and failure-classification regressions. The live sixth-matter run confirmed that the revised developer adapter renders a completed task; attorney and buyer also passed that initial check. The full matrix did **not** pass: a subsequent browser check exceeded 60 seconds for attorney, developer, buyer and seller while concurrent sessions were refreshing. Agent was not in the final failure list. Database responses included repeated `57014` statement timeouts and successful requests taking tens of seconds. This does not establish that the entire delay is database execution rather than queueing/network time.

The run stopped before all three lanes and all outcomes could be certified. Do not describe completion/N/A/reopen across all roles as accepted. The test's cleanup assertions completed, and a separate staging read verified transfer `instruction_received` was restored to `completed`, comment `null`, visibility `internal`. History was retained. Preview server stopped. Production and the original worktree remain unchanged.

Next release blocker: isolate the concurrent refresh/read bottleneck (including workspace identity and portal loaders), then repeat the full matrix. Increasing timeout limits alone is not acceptance. Legacy storage paths, portal permission/RPC errors and missing scenario facts remain separately tracked above.
