# Loading reliability — staging verification

## Scope

Staging `vaszuxjeoajeuhlcnzzf` only. No production deployment or production migration.

## Root cause and repair

The buyer SELECT policy's correlated transaction check was planned as a hashed
subplan scanning all 282 transactions and evaluating nested transaction access
rules. An authenticated single-buyer lookup took 1,147.6 ms (13,735 buffer hits).

Migration `20260911100546_bound_buyer_workspace_permission_reads.sql` adds the
missing `transactions(buyer_id)` index and `OFFSET 0` to preserve the correlated
EXISTS lookup. It changes neither the access predicate nor the policy role, and
does not bypass transaction RLS, grant new access, or raise timeouts.

The same authenticated query then used the buyer index and took 20.3 ms
(2,806 buffer accesses). These are diagnostic samples, not a production SLA.
An isolated journey read succeeded; reducing the costly buyer permission scans
removed the observed contention in the subsequent browser qualification.

## Refresh behavior

- A retryable journey read failure retains only the same matter's last successful
  snapshot, with an explicit stale-data notice. A successful read clears the notice.
- Authorization and invalid-plan failures are not classified as retryable.
- A failed document refresh displays a Retry notice while retaining loaded documents.
- Development hot reload can reset a selected document panel. Final acceptance uses
  a fixed Vite staging build served on localhost:4180, not the live-edit dev server.

## Verification

- Five fresh browser contexts: document selection and saved state survived a full
  refresh observation interval; no workspace API failures or telemetry failures;
  journey available in all five.
- Original versus updated buyer policy returned identical complete visible-buyer
  sets for the staging attorney (8), agent (1), and developer (166).
- Stable-rollup tests, transient-error classification tests, read-only document
  tests, live-refresh queue/hook tests pass.
- Staging build passes with existing chunk/import warnings.
- Deliberately injected journey timeout: the journey and selected document stayed
  visible, the stale-data notice appeared, and the next successful refresh cleared
  the notice without losing document state. Browser assertion passed.
- Security advisors retrieved after the narrow policy/index change. Existing
  project-wide findings are not addressed by this pass.

Browser test: `DOCUMENT_ACCEPTANCE_ORIGIN=http://localhost:4180 node scripts/document-cold-load-acceptance.mjs`.
Failure injection: additionally set `DOCUMENT_REFRESH_FAILURE_TEST=1`.

This closes the observed loading bottleneck in the tested staging fixture; it is
not a claim that every scenario/role has completed the broader release acceptance.

## Follow-up catalogue diagnostic

The older `shared-matter-journey-reader.test.mjs` built a September 8 database but
compared it with current application definitions. It also treated professional and
client readers as the same contract, despite later client-redaction migrations.
The fixture now applies those forward migrations and checks the appropriate reader
for each role. Its six scenarios/five-role projections, Work/header parity, missing
rows, access denial and revision assertions pass, as does the reconciliation suite.

Live staging read-only comparison: all 63 current task definitions match the app's
phase labels/order exactly; 27 historical transfer definitions remain intentionally
for legacy matters. The one active persisted workflow plan has zero legacy-key
references. No catalog entries or saved task outcomes were deleted or rewritten.
