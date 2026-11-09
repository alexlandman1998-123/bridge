# Domain API boundaries

Each directory owns the public boundary for one business capability. New application code should import an extracted capability directly from its domain instead of `src/lib/api.js`.

Development detail reads now use `developments/api.js`: the development, units, financials, documents, marketing, configuration and partner options load without the legacy API. Supporting transaction-summary, document-requirement, portfolio and partner reads live in their respective domains. Listing covers use `services/listings/listingCoverReadService.js` so reading a cover does not import seller workflows. Historical public names are pinned to their owning modules by the domain capability contract.

The desktop development overview opens through `developments/overviewReadApi.js`. Its read-only `bridge_development_overview_summary` RPC applies the caller's table RLS and returns whole-development summary counts/values, at most 25 units, three attention rows and four recent rows. Unit pages use a stable primary-key cursor. Narrow development/profile metadata (including fixed header-cover pointers) and existing read-only settings/configuration readers complete the opening data; full marketing media libraries, linked listing details, document requirements/evidence and complete transaction lists do not load on opening. A missing RPC produces an actionable retry error rather than silently downloading the complete inventory.

`useDevelopmentDetailData.js` owns the actor/workspace/development scope, deduplication, local retries and stale-response fences. `detailSectionReadApi.js` loads complete inventory and profile/listing detail when a view needing them is opened, retaining the existing stock map, filters, bulk editing and transaction workflows. Documents, catalogue/structure and financials have their own gates. Listing channel statistics now wait for their explicit expander. Organisation users, partner options, organisation defaults and lead/contact enrichment wait for a non-overview workspace. Closed sections are not automatically refreshed when the overview receives an update. Unit edits refresh the small summary without replacing complete inventory or resetting metadata forms.

The complete `fetchDevelopmentDetail` contract, including its `deferOptionalData` option, remains available to existing callers. An overview page is not a complete unit collection: global charts, health indicators and totals use `overviewSummary`, never the 25 returned rows. Complete views wait for the inventory gate before allowing stock-dependent operations.

The prepared append-only migration is `supabase/migrations/20261109113248_development_overview_summary_read.sql` at the repository root. It must be applied before releasing the new frontend; it has not been applied by the local fixture verification. The new function is `SECURITY INVOKER`, `STABLE`, authenticated-only, with an empty search path and no write/storage operations.

Focused checks are `overview.database.test.js`, `overviewReadApi.test.js`, `detailLoading.test.jsx` under `src/domains/developments/__tests__/`, plus `src/pages/__tests__/DevelopmentDetail.loading.test.jsx`. Run Vitest with one worker and `--no-file-parallelism`, or use the API baseline. The real migration is executed in isolated PGlite with RLS, and the real Supabase SDK uses an in-process fixture transport at 50, 500 and 5,000 units. Set `DEVELOPMENT_OVERVIEW_MEASUREMENT_OUTPUT=/absolute/path/report.json` to export the benchmark. The summary/unit RPC stays at one request, 25 rows and approximately 30 KB for those fixtures. This excludes the supporting metadata reads and does not establish live PostgreSQL latency or browser paint performance.

Additional focused read entries:

- `developments/selectionReadApi.js`: development options, unit choices and participant/assignment reads. `developments/portfolioReadApi.js` owns the portfolio cards.
- `transactions/workspaceReadApi.js`: transaction route core, lightweight shell and property context. `transactions/listReadApi.js` owns unit and transaction lists; `transactions/activityReadApi.js` owns events and proxy updates.
- `documents/listReadApi.js`: document lists, viewer filtering and existing private-URL/final-descriptor handling.

The desktop Documents hub opens through `documents/workspaceReadApi.js` with at most 25 selector rows. Its unit cursor uses the primary-key order; transaction and buyer projections contain only selector fields. Organisation and participant checks run before rows are exposed. A client must be selected before its checklist, evidence and file URLs load through the existing document visibility rules. Development libraries and locally stored company files wait for their tabs. Upload refreshes reload the selected client; `useDocumentClientWorkspace.js` deduplicates pending reads and discards results after selection or actor/workspace changes. The complete `fetchDocumentsByUnit` API remains available to existing callers.

The agency lead controller uses a lead-scoped opening read from `lib/agencyCrmRepository.js`: one lead, one contact, up to three recent activities and three pending tasks ordered by due date. Its normal complete-read default is unchanged. Opening no longer schedules an organisation-wide pipeline reload; explicit and realtime refreshes stay on the open lead. History, appointments, signing/documents, viewing responses, listing details and assignment options wait for their tabs or controls. Unloaded appointment counts remain unknown, and seller document actions ask for verification in Documents. Equivalent lead cache snapshots must not be rewritten into a render/hydration loop.

Focused coverage includes `src/pages/__tests__/Documents.lifecycle.test.jsx`, `src/domains/documents/__tests__/workspaceReadApi.test.js`, `src/domains/documents/__tests__/clientWorkspaceLoading.test.jsx`, `src/lib/__tests__/agencyCrmOpeningWorkspace.test.js`, and `src/pages/agency/__tests__/AgencyPipelinePage.opening.test.jsx`. Run Vitest with one worker and `--no-file-parallelism`; use the existing calendar refresh and API extraction contracts for shared regression coverage. These tests establish bounded read contracts, not hosted latency or database query plans.

`services/observability/openingRequestTrace.js` observes the existing SDK transport without cloning response bodies or sending telemetry requests. The last 20 opening reports are available in session storage under `arch9:opening-request-history` and through the `arch9:opening-request-performance` event. Reports include consumed decoded-body bytes, request durations, exact duplicate GET/HEAD counts, database transaction timing coverage and time to the `interactive_ready` frame. They identify whether timing began at navigation, an explicit route transition or route render. Database time comes only from exposed `Server-Timing` `transaction`/`db` durations; absence is recorded as unknown, never inferred from network latency. See [PostgREST timing semantics](https://docs.postgrest.org/en/stable/references/observability.html). Query filters, credentials and response contents are excluded from reports.

`lib/scopedReadCache.js` owns caller-scoped reference reuse: development scope and document requirements live for at most 30 seconds, pending lookups join, errors are not cached, and invalidation retires pending cache generations. Actor/workspace/role changes create a new instance; workspace clearing, CRM/development/transaction changes and same-tab/cross-tab requirement notifications invalidate references. Participant permissions and client evidence are read fresh. Mutable lead workspace results use zero completed-value lifetime and share only concurrent reads. Document selector and development-option snapshots also expire and refresh on applicable notifications. A change notification supersedes an in-flight client view instead of accepting stale evidence.

The local SDK fixture benchmark is `src/services/observability/__tests__/openingRequests.fixture.test.js`. It compares three selector pages and two client views, plus two concurrent lead openings. Set `REQUEST_MEASUREMENT_OUTPUT=/absolute/path/report.json` when running it to save counts, decoded bytes and timings. Its HTTP delay and `Server-Timing` values are controlled fixtures; they do not measure live PostgreSQL execution, production latency or browser paint.

`lib/developmentDetailApi.js` and `lib/transactionWorkspaceApi.js` re-export separated reads and cache invalidation directly. Actions load their owning feature module when called; no adapter retains a legacy fallback. Functions that also create records, prepare workflows or trigger reminder automation remain workflow operations even when named `fetch` or `get`.

Separated action/workflow owners:

- `developments/creationWorkflow.js` preserves the existing create-then-setup sequence, warnings and saved development ID after a later failure. `detailActions.js`, `configurationActions.js`, `financialActions.js`, `stockActions.js` and `documentActions.js` own the corresponding persistence steps.
- `developments/marketingActions.js` and `partners/invitationActions.js` preserve invitation delivery and event-audit outcomes separately from the authoritative insert. Importing these modules must not send anything.
- `onboarding/workflow.js` owns onboarding record reuse/creation and delivery-status recording. `documents/requirementActions.js` owns requirement preparation. `transactions/eventActions.js` retains actor-pinned audit writes and the optional workflow recompute hook.
- `access/actorContext.js` retains the existing session/profile resolution. Shared storage and schema fallback primitives stay under `lib/api/shared`; development-specific persistence fallback stays in `developments/persistenceHelpers.js`.

Portfolio creation controls use the development adapter; developer lead handoff uses the transaction adapter. Settings development saves import only their feature actions after the existing admin check. Transaction creation, finance, signing and lifecycle workflows now also have domain owners. Do not replace or reorder their validation and recovery stages while moving them.

`transactions/readCache.js` owns the existing summary and shell caches; selector caches live with their read entry. Domain mutations and reads must share those instances and invalidators. Do not replace an existing query with a similarly named summary reader that has a different projection or permission contract.

The configuration helper retains its existing explicit `createIfMissing` option for mutation callers; development reads pass false or use its false default. Opening a development must not create or update settings.

For the complete local API regression selection, run `npm run test:api-baseline` from the primary app. See [the baseline guide](../../docs/api-verification-baseline.md) for scope, logs and memory limits.

Measure source import paths and the isolated development read bundle with:

```sh
node scripts/api-loading-paths.mjs --output=/tmp/arch9-api-loading-paths.json
npx vitest run src/domains/developments/__tests__/readApi.test.js src/domains/developments/__tests__/readBundle.test.js src/lib/api/__tests__/apiExtraction.contract.test.js --maxWorkers=1 --no-file-parallelism
npx vitest run src/domains/transactions/__tests__/readSeparation.test.js src/domains/transactions/__tests__/readBundles.test.js --maxWorkers=1 --no-file-parallelism
npx vitest run src/domains/developments/__tests__/workflowSeparation.test.js src/domains/developments/__tests__/workflowBundles.test.js --maxWorkers=1 --no-file-parallelism
node --test --test-concurrency=1 src/lib/__tests__/developmentCreation.test.js
```

For another read group, pass `--probes=/absolute/path/probes.json`. The JSON is an array of `{ "label": "transactionFirstLoad", "entry": "src/domains/transactions/workspaceReadApi.js", "exports": ["fetchTransactionRouteCoreById"] }` objects. Record a before measurement before an extraction; do not restore the retired API to collect one. Each separated entry is checked for accidental inclusion of that legacy module.

The measurement excludes third-party packages and does not reproduce Vite's production chunking or browser load times. Dynamic reachability includes optional actions and does not prove that opening a screen executes them. Use a hosted build and signed-in browser measurements before claiming an overall page-load improvement.

Domain modules may depend on `src/lib/api/shared` and `src/core`, but must not depend on pages, components, or the legacy `src/lib/api.js` facade.

Optional development UI loads on intent too: portfolio creation waits for Add Development; development availability/reservations, transactions, snags and marketing sections wait for their tab or section; structure and catalogue setup wait for their dialogs. Developer lead document tools wait for Documents, including direct tab links. `components/ui/DeferredWorkflow.jsx` keeps loading local to the requested area and can retain an opened modal's state after closing. Keep its `active` gate outside the lazy component so a closed dialog cannot request its code. Reuse the existing app error boundary for failed/stale chunks.

Check these initial route boundaries without a full build (third-party packages excluded):

```sh
node scripts/optional-workflows-loading.test.mjs
npx vitest run src/components/ui/__tests__/DeferredWorkflow.test.jsx src/pages/__tests__/Developments.workflows.test.jsx src/pages/__tests__/DeveloperLeadsPage.access.test.jsx --maxWorkers=1 --no-file-parallelism
```

The bundle check follows emitted static JavaScript imports and asserts that all 14 optional components remain emitted but are absent from the three routes' initial closures. It does not claim a production download size or browser timing improvement.

Final retirement: `src/lib/api.js` has been removed. The remaining transaction, document, onboarding, portal, finance/bond, access, partner and reporting operations now live in 65 domain modules. The adapters load a module per requested operation and contain no legacy fallback. New consumers should import their capability directly. Run `node scripts/api-split-phase6-retirement.test.mjs` to enforce zero callers, absence of the old entry point, bounded module sizes and no cycles in the final extraction. Historical source-based tests use the test-only helpers under `scripts/helpers/`; production code must never depend on those helpers. See `docs/api-split-phase6-retirement.md` for the repeatable checks.
