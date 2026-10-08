# Listing Overview channel statistics

Reviewed: 8 October 2026. Owner: the primary Arch9 workspace (`the-it-guy/`).

The requested outcome is a second row of three cards below **Leads / Viewings / Days on market**: **Property24 / Private Property / Website**. Each card shows this listing's views and the channel's own contact measures for a shared 7, 30 or 90-day period. The backend and cards are implemented locally. The sections below record the source map, implementation and verification evidence. No hosted data or deployment was changed.

The initial screen is [AgentListingDetail](../src/pages/AgentListingDetail.jsx). The existing [Listing Overview performance service](../src/services/listings/listingOverviewPerformanceService.js) and `listing_overview_performance` RPC are the read path to extend. Rental portal mappings also carry `listing_type`; their identifiers must retain that distinction. This mapping does not change the separate public website or admin applications, or expose these cards in the seller portal.

## Confirmed sources and display fields

| Card measure | Property24 API → existing storage | Private Property API → phase 2 storage needed | Website → existing storage |
| --- | --- | --- | --- |
| Views | `viewCount` → `view_count` | `Views` | Sum `website_analytics_daily.event_count` for `event_type = 'listing_view'` |
| Alerts | `alertCount` → `alert_count` | `Alerts` | Unsupported; omit |
| Portal contacts | Provider `totalContactLeads` → `total_contact_leads` | No total in this response; omit a combined total | Not a portal measure |
| Contact forms / messages | `requestDetailsLeads` → `listing_contact_form_leads` | `Messages` (label **Messages**, not unique buyers) | Accepted listing-specific receipts in `website_lead_submissions` (label **Website enquiries**) |
| WhatsApp contact forms | `whatsAppLeads` → `whatsapp_contact_form_leads` | No separate field in this response | No dedicated measure verified |
| Phone contacts | `telLeads` → `tel_leads` | `TelLeads` | No dedicated measure verified |
| SMS contacts | `smsLeads` → `sms_leads` | No separate field in this response | No dedicated measure verified |
| Statistics day | `date` → `statistic_date` | `Date` | `event_date`; enquiry `created_at` must use the agreed day boundary |
| Data timestamp | Stored `synced_at`; source freshness endpoint also available | Record successful retrieval time separately from `Date` | `updated_at` is the latest tracked activity, not a successful sync timestamp |

These measures are activity counts, not a common count of unique people. Do not add channel contacts to the Overview's top **Leads** count, which uses canonical listing-linked CRM records. Do not manufacture a Private Property total by adding messages and phone leads, or a Property24 total by adding contact fields. Cross-channel contact rates and trend charts are outside the first card release.

### Property24

Existing [client methods](../server/services/property24Client.js), [field contract](../server/property24/statisticsContract.js), [snapshot mapper](../server/property24/statisticsStorage.js) and [sync service](../server/property24/statisticsSyncService.js) support:

- `GET /listing/v55/listings/{listingNumber}/statistics?startDate=…&endDate=…` for one portal listing.
- `GET /listing/v55/listings/statistics` with `agencyIds`, `listingType`, `startDate` and `endDate` for agency listing rows.
- `GET /listing/v55/statistics/last-update-date` for the latest available statistics day.
- Lead-statistics periods and agency/suburb summaries also exist, but are not the source for a per-listing card. Summary rows do not provide `totalContactLeads`.

The sync requires Listing Service v55 or later, fetches both Sale and Rental, and saves daily rows in `property24_listing_statistics_daily`. Its default lookback is seven days and a single requested window is limited to 62 days by Arch9. A 90-day first backfill therefore requires multiple windows. Confirm the supplier's inclusive/exclusive date boundary with adjacent requests in phase 2 before relying on chunk boundaries; the current sync uses the latest source date plus one day as its default end.

The repository schedules `/api/property24/statistics/sync` daily at `02:15 UTC` (`04:15 Africa/Johannesburg`). A cron declaration is not evidence that a hosted run succeeded. Both scheduled and manual statistics paths currently resolve environment credentials; review organisation-specific credential resolution when connecting phase 2. Do not assume that a listing's publication sync or lead-import checkpoint proves statistics freshness.

### Private Property

The production and sandbox `AgentImport` service definitions contain these SOAP methods:

| Method | Request fields | Intended use |
| --- | --- | --- |
| `ListingPerformanceStats` | `PropertyRefs` (string array), `Date` (`dateTime`), `Token` | Daily views, alerts, messages and phone contacts for the requested portal references |
| `LeadStatDetail` | `UniqueListingId`, `BranchGuid`, `StartDate`, `EndDate`, `Token` | Separate listing enquiry report; not needed for the initial card |
| `LeadStatSummary` | `BranchGuid`, `StartDate`, `EndDate`, `Token` | Separate branch enquiry report; not a per-listing views source |

`ListingPerformanceStatsResult.ListingPerformanceStats.ListingPerformanceStatsOnDate` contains `Date`, `Messages`, `TelLeads`, `Views`, `Alerts` and `PropertyRef`. The current [Private Property client](../server/services/privatePropertyClient.js) can make generic SOAP calls but has no statistics wrapper or persistence path. Lead webhook delivery is a separate integration and cannot supply listing views.

Primary references:

- [Production WSDL](https://services.privateproperty.co.za/AgentImport/AgentImport.asmx?WSDL)
- [Sandbox WSDL](https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx?WSDL)
- [Sandbox ListingPerformanceStats request and response](https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx?op=ListingPerformanceStats)

Authenticated read-only sandbox checks used one reference returned by `GetActiveListings`:

| Requested day | Result | What it establishes |
| --- | --- | --- |
| 7 October 2026 | HTTP 500, supplier `PP50`: statistics not yet available for the supplied date | A recent missing day must remain unavailable, not become zero |
| 6 October 2026 | HTTP 200; one matching reference/date row with all four metric fields | Authentication and daily lookup work for the sandbox account |
| 8 September 2026 | HTTP 200; one matching reference/date row with all four metric fields | A historical daily lookup works |
| 9 July 2026 | HTTP 200; one matching reference/date row with non-negative integer metrics | The sandbox accepts a date older than the proposed 90-day window |

Changing the 7 October request from a timezone-less timestamp to a UTC timestamp returned the same `PP50` outcome. Older dates succeeded. This is evidence of reporting delay for the tested date, not an authentication failure. It does not establish the supplier's guaranteed update schedule, timezone, retention policy, maximum batch size, or production account permission. Zero-valued historical rows alone do not prove that non-zero activity is retained for that entire period.

Phase 2 should request a day and a bounded list of portal references, verify the returned `PropertyRef` and `Date`, and upsert rather than accumulate repeated retrievals. Treat `PP50` as pending availability; retain previous successful data and retry later. Do not catch every supplier fault as `PP50`. Leave authentication, malformed response and unexpected reference errors distinct.

### Website

The public Next.js website uses [ListingAnalyticsTracker](../../apps/websites/components/site-analytics.tsx) and its [analytics endpoint](../../apps/websites/app/api/analytics/route.ts). Home Seekers uses [its property page](../src/pages/HomeSeekersProperty.jsx) and [analytics endpoint](../api/home-seekers/analytics.js). Both write `website_record_analytics_event` into the same aggregate daily table.

- Views count listing page events. They are not unique visitors. Repeated visits may count again, and browser tracking preferences or failed requests may omit visits.
- Site visits and general page views must not be counted as listing views.
- For enquiries, count distinct receipt IDs where `listing_id` and `organisation_id` match, `submission_type = 'property_enquiry'`, and status is `received`, `routed` or `duplicate`. This follows the existing website dashboard's accepted-submission rule. Exclude blocked/failed receipts and general, valuation, campaign and recruitment forms. A duplicate receipt represents an accepted enquiry, not another newly created CRM lead; an idempotent retry of the same receipt must count once.
- Both [Home Seekers lead capture](../server/services/homeSeekersLeadCaptureApi.js) and the hosted website use `website_capture_lead_submission` and the receipt ledger. The current listing Overview RPC reads website views, but does not yet return enquiries.
- Independent external websites now use `external_connection_id` in the same receipt ledger, with no `website_site_id`. They have no listing-view source verified here. For this first card, include only Arch9 hosted-site receipts and views; do not combine independent external-site enquiries with a hosted-site view denominator.
- Partner-owned sites can advertise another organisation's listing. The current Overview reader restricts views to sites owned by the listing's organisation. Preserve that scope for the first version; partner-site activity requires a separately authorised reader.

Absence of website view rows does not distinguish no visits from a broken tracker. A published site alone is insufficient evidence that tracking worked throughout a period. Label a timestamp from `website_analytics_daily.updated_at` as **Last tracked activity**, not **Last synced**.

## Listing identity and ownership

| Source | Lookup and scope | Daily identity / deduplication |
| --- | --- | --- |
| Property24 | Resolve numeric `listing_number` through the organisation's `property24_listing_syncs`, joined to its `private_listings`; verify `agency_id` and environment. Do not treat a public URL or a browser-supplied agency as ownership evidence. | Existing `(organisation_id, environment, agency_id, listing_number, statistic_date)` unique key. Rows with no local listing match must not appear on a card. |
| Private Property | Resolve returned `PropertyRef` through `private_property_listing_syncs.private_property_ref`, joined to the organisation's `private_listings`; verify saved `branch_guid`, environment and listing type. `property_id` / `UniqueListingId` is the submitted ID, not the portal reference required by `ListingPerformanceStats`. | Proposed phase 2 key `(organisation_id, environment, branch_guid, private_property_ref, statistic_date)`, retaining `private_listing_id` and listing type. Conflicting mappings stay unavailable for review. |
| Website | Use the Arch9 listing UUID, `website_site_id`, and the site's organisation. Both publications and source rows must belong to the permitted site/listing scope. | Sum existing daily event buckets; count distinct accepted receipt IDs. Do not multiply rows by joining event buckets and receipts before aggregation. |

Only production portal rows enter the normal agent Overview. Sandbox/exdev evidence remains separate. Statistics retrieval is a server operation using the existing credential storage; the browser receives aggregate metrics, dates and availability only. Preserve the Overview reader's authenticated membership and listing-ownership checks. If its RPC must change, create an append-only migration rather than editing an existing migration.

## Period, coverage and availability contract

Phase 2/3 target: one selected period, default 30 days, with 7 / 30 / 90-day options. Use completed days to avoid comparing an in-progress website day with delayed portal reporting. The requested end is yesterday in Africa/Johannesburg; keep each provider's calendar date unchanged and show **Data through** separately when it lags. Verify the website database day boundary and both portals' date semantics before claiming exact timezone alignment. Do not silently shift the selected period independently for each channel.

For a selection on 8 October 2026:

| Period | Requested calendar dates, inclusive |
| --- | --- |
| 7 days | 1–7 October 2026 |
| 30 days | 8 September–7 October 2026 |
| 90 days | 10 July–7 October 2026 |

The existing Overview SQL includes today and uses database `current_date`. That is existing behaviour, not the new completed-day contract. Property24 also defaults to its latest available date. Phase 2 must reconcile these boundaries explicitly. A channel with incomplete dates can show an available subtotal with **Partial data** and its actual coverage; it must not present that subtotal as a complete period or compare it to a complete channel total.

Extend the current channel objects without removing `connected`, `available`, `views`, `previousViews`, `portalContacts`, `lastSyncedAt` or `reason`. The implementation needs separate per-metric availability, requested date bounds, latest statistics day, successful retrieval time, coverage, and source-specific metrics. Do not overload one `available` flag to mean both connection and complete data. These are requirements for phase 2, not fields implemented in phase 1.

| Situation | Card behaviour |
| --- | --- |
| Confirmed numeric zero for a covered metric/period | Show `0` |
| Not published and no statistics history | Show **Not published** |
| Published but no successful statistics retrieval | Show **Awaiting first sync** |
| Supplier day not ready / missing days | Show **Partial data** or **Awaiting statistics**, with the actual data-through date |
| Previously synced but now withdrawn | Preserve historical period statistics; show publication status separately |
| Missing source field | That metric remains `null` / **Unavailable**, even if other metrics exist |
| Failed refresh with prior data | Keep prior values and timestamp; show a refresh failure |
| Unsupported metric | Omit the row |

## Phase 1 implementation checklist

1. Add the Private Property typed request/parser, daily storage and per-branch run coverage. Validate production permission with a read-only call using one known agency-owned reference before activating its statistics scheduler. Sandbox success does not settle this production gate.
2. Extend `listing_overview_performance` with Private Property metrics, website accepted enquiries, alerts, source-specific contacts, coverage and data dates. It currently hardcodes Private Property unavailable, omits website enquiries/alerts, treats any Property24 daily row as sufficient availability, and coalesces missing Property24 fields to zero. Preserve missing-vs-zero distinctions per metric.
3. Backfill selected periods in bounded chunks. Existing Property24's seven-day default cannot immediately satisfy a 30/90-day card. Add coverage evidence so a single row does not imply an entire period is complete. Confirm supplier limits and rate policy before choosing Private Property batch size and daily request concurrency.
4. Align calendar boundaries and freshness labels. Confirm website tracking health separately from latest activity; empty website buckets alone cannot prove a complete zero-view period.
5. Review the scheduled Property24 credential path for per-organisation accounts; wire Private Property statistics scheduling separately from its existing event reconciliation. Do not invoke the current write-producing statistics sync routes as part of a read-only access probe.
6. Update `normalizeListingOverviewAnalytics` when adding new fields; it currently discards source fields outside the small existing channel model. If retaining total-view aggregation, include Private Property only once its metric is available and expose partial coverage; the current builder sums Property24 and website only.

Phase 3 then builds the three cards and shared selector. Phase 4 verifies source totals, isolation, repeated syncs, missing days, failed refreshes, publication changes and mobile layout. No new numbered npm command is needed.

## Verification and remaining limits

The following existing checks passed from `the-it-guy/` on 8 October 2026:

| Check | Result |
| --- | --- |
| `npm run test:property24-statistics-contract` | Passed |
| `npm run test:property24-statistics-storage` | Passed |
| `npm run test:property24-statistics-sync` | Passed |
| `npm run test:website-analytics-phase3` | Passed |
| `npx vitest run src/services/listings/__tests__/listingOverviewPerformanceService.test.js --maxWorkers=1` | 6 tests passed |
| Local document links and 7/30/90-day date examples | Verified |

These checks validate the current source assumptions; they are not certification of new card behaviour or the hosted schema. The authenticated Private Property sandbox probes above performed read operations only. No database sync route, listing mutation, lead submission, email or deployment was run.

At the end of phase 1, the source map was ready for implementation. Production Private Property statistics permission, non-zero historical retention, supplier batch/rate limits, and exact day-boundary alignment remain explicit integration gates. Hosted Property24/website counts were not queried and no hosted deployment state is inferred from repository migrations.

## Phase 2 implementation — 8 October 2026

The primary workspace now has the server retrieval and aggregate read paths needed by the three cards. The [new migration](../../supabase/migrations/20261008113615_listing_overview_channel_statistics.sql) is local and unapplied. It adds Private Property daily records, access verification, retrieval runs and retry metadata, and replaces the existing Overview reader without changing its signature. It does not create another website tracker or change CRM lead counts.

### Retrieval and activation

| Source | Implemented behaviour |
| --- | --- |
| Property24 | Both existing statistics endpoints now prefer the organisation's Vault credentials. Manual settings sync defaults to 90 completed days; the daily scheduler replays seven days. Explicit bounds are inclusive. Backfill uses 30-day chunks with one extra fetched boundary day on each side, then persists only the requested dates. This works with either inclusive or exclusive supplier boundaries in fixtures. Cross-agency response records are rejected. |
| Private Property | The typed `ListingPerformanceStats` request validates references and calendar dates. The parser verifies reference/date identity, preserves absent fields as `null`, and rejects invalid counters. Daily upserts retain listing, branch, environment and listing type. One reference is requested per call until supplier limits are confirmed. |
| Website | The Overview reader reuses existing listing-view buckets and accepted hosted-site enquiry receipts. It excludes independent external-site submissions, other organisations' sites, blocked/failed receipts and general enquiries. There is no new ingestion job. |

`POST /api/private-property/settings/statistics-sync` requires an authenticated organisation settings administrator. Its JSON body contains `organisationId`, `configId` and one action:

| Action | Effect |
| --- | --- |
| `probe` | Read-only supplier check against one owned reference, trying up to seven completed days. Returns verification and the successful source date; saves nothing. |
| `verify` | Runs that check and saves server-private access evidence with scheduling disabled. |
| `enable` | Runs that check and enables scheduling for that exact configuration and credential scope. |
| `disable` | Disables scheduling without requiring a supplier call. |
| `sync` | Retrieves and stores a bounded batch. Production requires prior successful verification. Optional `days` (default 90), `startDate` and `endDate` select an inclusive 1–90 completed-day window. Repeat calls continue the backfill. |

Access evidence is bound to organisation, environment, branch, supplier host and credentials. A credential or scope change requires a new successful verification. Sandbox evidence cannot activate production. Tokens, passwords, credential fingerprints and raw supplier faults are never returned to the browser.

The new `/api/cron/private-property-statistics` entry runs every ten minutes after deployment, but performs no work unless `PRIVATE_PROPERTY_STATISTICS_SYNC_ENABLED=true`, `CRON_SECRET` authentication succeeds and the production agency's statistics access is enabled and still verified. It selects at most four enabled production configurations in order of last scheduled attempt, with at most two sequential statistics requests each. An invocation makes at most eight statistics requests; manual sync also allows at most eight. Endpoint duration is configured to 300 seconds.

Private Property backfill repairs missing dates first, newest first, then refreshes the latest three stored days. A one-hour cooldown for attempted reference/dates and supplier-pending dates lets later runs continue older missing dates without repeatedly hitting a delayed day. `PP50` and empty responses leave daily metrics untouched. Other faults are recorded as failed runs. Inventory reads are paginated, with explicit failure rather than silent truncation at 10,000 mappings or 100,000 daily/retry records in a selected window. Initial coverage therefore fills progressively; the supplier's rate policy and actual backfill pace still require confirmation before activation.

### Reader contract for phase 3

`listing_overview_performance(organisation UUID, listing UUID, days)` verifies the signed-in user's active organisation membership and listing ownership. Normal cards read production portal history only; withdrawal does not discard earlier records.

- `period` contains shared inclusive start/end dates, completed-day count and `Africa/Johannesburg` timezone.
- Each channel retains its existing keys and adds `published`, `state`, `complete`, `metrics`, `coverage`, `requestedStartDate`, `requestedEndDate`, `dataThrough`, `lastAttempt` and timezone evidence.
- Each supported metric has its own `value`, `available`, `complete` and, for portal daily metrics, `coveredDays`/`expectedDays`. Explicit numeric zero remains zero; no rows or absent fields remain `null`. Sparse records are subtotals with partial coverage.
- Property24 exposes `views`, `alerts`, `portalContacts`, `contactForms`, `whatsAppContacts`, `phoneContacts` and `smsContacts`. Private Property exposes `views`, `alerts`, `messages` and `phoneContacts`; it has no invented combined contact total.
- Website exposes `views` and `enquiries`. Views have `coverage.kind=activity_only` and remain incomplete because event buckets cannot establish continuous tracking. Enquiries count accepted receipts over the selected timestamps. `lastTrackedAt` is separate from portal `lastSyncedAt`; website never receives a fake sync timestamp or a zero-view period inferred from publication alone.
- A failed refresh preserves stored values and is identified through `lastAttempt`. Previous portal views are available only for a completely covered preceding period. The frontend total includes available Private Property views, flags partial totals and suppresses a trend when the included periods lack complete coverage.

Provider dates remain unchanged. `sourceTimeZone` and `timezoneAligned=false` explicitly retain the unresolved provider/database day-boundary evidence. The frontend normalizer preserves the new fields for the phase 3 cards; no screen layout was changed in phase 2.

### Local verification and release boundary

The focused suite passed **32 tests**:

```sh
npx vitest run server/tests/listingChannelStatistics.test.js server/tests/listingChannelStatisticsMigration.test.js src/services/listings/__tests__/listingOverviewPerformanceService.test.js --maxWorkers=1
```

The migration tests execute the SQL in isolated PGlite/Postgres fixtures, including missing-versus-zero counts, partial coverage, failed refresh preservation, website receipt filtering, production-only history, ownership rejection and authenticated access. Server tests cover SOAP validation, bounded retries, delayed dates, deduplication, credential changes, production verification, safe errors, all four inclusive/exclusive Property24 boundary combinations and scheduled partial results. Fixtures do not contact either supplier or a hosted database.

Existing focused checks also passed: `test:private-property-phase1`, `test:private-property-browser-api`, `test:property24-statistics-contract`, `test:property24-statistics-storage`, `test:property24-statistics-sync`, `test:property24-statistics-operations` and `test:website-analytics-phase3`. ESLint passed for the changed JavaScript files. The Supabase security advisor was attempted with `supabase db advisors --local --type security` but could not connect because no local Supabase database is running. The isolated SQL tests verify RLS, function/schema/table privileges and the reader's access checks; hosted advisor verification remains pending.

Release still requires explicit approval to apply the migration and deploy the API/cron changes, followed by a production Private Property read-only permission check and controlled backfill. Hosted security advisors and live totals must be checked against the released schema. Phase 3 implements the cards and shared selector; phase 4 checks the complete live flow and responsive layout.

## Phase 3 implementation — 8 October 2026

The agent listing Overview now renders [ListingChannelStatistics](../src/components/listings/ListingChannelStatistics.jsx) immediately below the existing Leads / Viewings / Days on market cards. Property24, Private Property and Website share a 7 / 30 / 90-day selector, defaulting to 30 completed days. The cards use the scoped phase 2 reader and show the returned calendar bounds. Overview's existing Refresh action also reloads these counts; the selector does not alter the CRM summary period or counting rules.

Each card shows views and its own supported secondary metrics. Confirmed zeros remain zero; missing metrics say Unavailable. Portal cards show view coverage, Data through and Last synced; website shows Last tracked activity and explains that continuous tracking coverage is unverified. Published channels with no statistics distinguish Awaiting first sync from Awaiting statistics. Withdrawal preserves available historical counts, with a separate Currently not published note. Failed supplier syncs and failed Overview reads preserve saved counts; a failed read offers Try again.

Changing the period or listing scope immediately hides the previous counts. Cleanup ignores late responses for earlier periods/listings. An older hosted reader without the completed-day contract is treated as unavailable, preventing its different date window from being relabelled as the selected period. Browser errors display a safe user message rather than raw database details. Loading, selection and retry controls have accessible names; the native radio selector supports keyboard arrows.

Local checks:

- The component and reader tests pass **20 tests**: `npx vitest run src/components/listings/__tests__/ListingChannelStatistics.test.jsx src/services/listings/__tests__/listingOverviewPerformanceService.test.js --maxWorkers=1`.
- Existing `scripts/listing-overview-performance-edit.test.mjs` and `scripts/listing-overview-phase3.test.mjs` pass, including component placement, listing/organisation scope and Overview refresh wiring.
- ESLint passes for the new component, its tests and updated checks. The existing listing page has no lint errors and 18 warnings in unrelated code.
- A focused Vite production library bundle of the new component and its local reader dependencies passed. Third-party packages were externalised for this check. The full application build was stopped after stalling under local memory pressure while other builds were running; it remains unverified for this turn.
- Playwright used the real component and frontend reader with a loopback-only RPC fixture. Desktop (1440px) and mobile (390px and 320px) were checked. Both mobile widths had document width equal to viewport width. The browser confirmed all three periods, keyboard selection, scoped RPC arguments, retained counts after a simulated read failure and successful retry. The fixture had one harmless missing-favicon console entry; no component errors were observed.

Screenshots of the local fixture: [desktop](../output/playwright/listing-channel-statistics-desktop-20261008.png), [mobile](../output/playwright/listing-channel-statistics-mobile-20261008.png). These contain simulated counts and a representative Overview frame, not production listing data.

No public website, admin console, seller portal, hosted database or deployment was changed. Live counts still require the approved phase 2 migration/API release and statistics activation. Phase 4 covers live source comparisons, hosted access/isolation, actual backfill behaviour, the full app release checks and the complete listing-page flow.

## Phase 4 implementation and verification — 8 October 2026

Phase 4 adds a repeatable integration check and fixes a retrieval issue. Local verification is complete; hosted release and live acceptance remain pending. The owning product remains the primary workspace.

Property24 statistics previously reused a reconciliation query that requested up to 5,000 rows in one call. A REST API row cap could silently omit later listings, leaving their daily statistics unlinked to the Overview. The statistics path now reads 500-row pages, filters organisation ownership through the listing relationship, validates mapping identity, and fails explicitly at its 10,000-row inventory boundary. Reconciliation behaviour is unchanged. The regression fixture enforces a 1,000-row response cap and proves that listing 1,201 is mapped while another organisation's listing is excluded.

The shared [database fixture](../server/tests/fixtures/listingStatisticsDatabase.js) creates isolated baseline organisation, listing, mapping and website tables, then executes the actual Property24 statistics foundation and phase 2 channel migrations. Its test-only REST adapter executes database queries, writes, upserts and triggers; it serializes dates like PostgREST. Supplier responses and credentials are fixtures. No test uses a hosted database or supplier account.

The new [integration tests](../src/components/listings/__tests__/ListingChannelStatistics.integration.test.jsx) run Property24 backfill and the typed Private Property SOAP client/parser into that database. They call the authenticated SQL reader through the real frontend service and render the real cards. They verify:

- Selected 7/30/90-day totals agree with retrieved daily values, including explicit zero and unavailable fields.
- Repeated upserts do not increase stored row counts; `PP50` and failed pulls preserve saved totals.
- Publication withdrawal retains history, and switching to an unauthorised organisation clears prior counts and denies the read.
- A missing stored day reduces coverage and produces a partial subtotal; today's statistics are excluded.

### Verification evidence

| Boundary/check | Result |
| --- | --- |
| Supplier fixture → retrieval → actual statistics tables → authenticated SQL reader → frontend service → cards | Passed in the integration suite |
| Focused server, migration, frontend reader, component and integration suite | **48 tests passed across five files** |
| Existing Property24 statistics contract, storage, sync and operations checks | Passed |
| Existing website analytics phase 3 check | Passed |
| Existing Listing Overview presentation and canonical performance wiring checks | Passed |
| Database-backed local browser: selected 7/30/90-day totals | Passed: Property24 14/60/180 views; Private Property 21/90/270 views; website 9 views and one accepted enquiry |
| Desktop and mobile layout of the real cards in a representative Overview frame | Passed: 1440px desktop; document width equals viewport width at 390px and 320px |
| Database-backed browser refresh failure, retry and publication withdrawal | Passed: retained 60 Property24 views on a failed read, recovered on retry, and showed history on all three withdrawn channels |
| ESLint on the phase 4 source, fixtures and checks; tracked diff whitespace check | Passed |
| Focused production bundle of the cards and local reader dependencies | Passed; four modules, 21.07 kB, third-party imports externalised |
| Full primary application production build | Unverified: stopped after approximately 14 minutes stalled during transformation under shared-machine memory pressure; only this task's build was stopped |
| Hosted production schema inspection (read-only) | Private Property daily/access tables absent; the completed-day reader contract absent; existing Property24 daily table present |

Run the repeatable focused suite from `the-it-guy/`:

```sh
npx vitest run server/tests/listingChannelStatistics.test.js server/tests/listingChannelStatisticsMigration.test.js src/services/listings/__tests__/listingOverviewPerformanceService.test.js src/components/listings/__tests__/ListingChannelStatistics.test.jsx src/components/listings/__tests__/ListingChannelStatistics.integration.test.jsx --maxWorkers=1
```

The full suite initially hit the new integration test's five-second default timeout while several builds competed for memory. The integration cases now allow 15 seconds; the final run passed all 48 tests. No application timeout was changed.

The Playwright fixture uses a loopback HTTP RPC endpoint backed by the isolated database, rather than hardcoded aggregate responses. Browser requests preserve the listing/organisation scope and selected period. Screenshots: [database-backed desktop](../output/playwright/listing-channel-statistics-database-desktop-20261008.png), [database-backed mobile](../output/playwright/listing-channel-statistics-database-mobile-20261008.png). Counts and the surrounding listing frame are simulated. An initial fixture launch from the repository root missed the primary app's Tailwind configuration; launching from the owning package resolved it without a source change.

The final browser refresh/withdrawal scenario passed in an isolated headless session. Its console contained the fixture's missing-favicon 404 and React development notices, with no card runtime error. The owned browsers and loopback server were closed after verification.

### Hosted release boundary and remaining acceptance

The first broken hosted boundary is the missing phase 2 schema/reader on **Arch9 SaaS** (`isdowlnollckzvltkasn`). Live card totals cannot be certified against that older reader. This phase did not apply migrations, deploy, enable statistics scheduling, store hosted metrics, publish listings or send messages.

An explicitly approved release must follow the existing [database release runbook](../../docs/database-release-runbook.md), including target identity, recovery evidence, the database guard, exact dry-run scope and focused checks. The intended statistics migration is `20261008113615_listing_overview_channel_statistics.sql`; unrelated pending migrations must not be swept into this release. The full primary app check must pass before release.

After the approved migration/API/UI release, verify the hosted schema and security advisors, open an actual agent listing Overview, and compare each selected period with stored source rows. Check a member, a non-member and a listing from another organisation. Verify the existing Refresh action and publication changes on that actual listing page. The local browser frame is not certification of the entire authenticated listing workspace.

Before Private Property activation, run its production read-only `probe` against an owned mapped reference, confirm historical retention and supplier rate policy, and confirm calendar alignment. Then approve a controlled backfill/activation for the specific configuration. Compare provider totals with stored rows and card subtotals, check delayed-day retry behaviour and observe scheduled progress. Provider timezone alignment, website tracking continuity and live Private Property access remain unverified; the cards continue to label partial/unknown coverage honestly.

## Legacy Property24 display audit — 8 October 2026

The audit covers live source in the primary workspace, root app, public website and admin console. Changes belong to the primary workspace; no legacy portal-statistics displays were found in the other products.

| Previous location | Decision | Result |
| --- | --- | --- |
| Marketing Overview portal totals, contact rates, trend chart and insights | Remove | Their current/custom-day windows differed from the new completed-day reader, and missing counters were converted to zero. The obsolete components, client normalizers and styles are removed. |
| Marketing per-listing rankings and Property24 CSV export | Remove | Both used the retired agency reader and omitted the new per-channel coverage contract. The table, export helper and their imports are removed. |
| Marketing source chart and channel table | Retain CRM attribution | Property24 leads come from organisation-scoped CRM records for the selected Marketing period. Portal reach and engagement remain unavailable. A visible note directs users to each listing's Overview for portal views and contacts. |
| Seller workspace estimates and manual view overrides | Remove | The adapter no longer derives views from leads/offers, invents a 72% portal share, accepts manual view counters or emits combined portal/website totals. The unused seller view normalizer is removed. The seller's authenticated CRM summary and channel lead attribution remain. |
| Shared listing performance model | Map explicitly | `property24Views` and `websiteViews` name the channels returned by the scoped reader; ambiguous `portalViews` and `bridgeViews` aliases are removed. Private Property remains a separate channel. |
| Listing Overview channel cards | Retain canonical reader | Views and supported contact counters use `listing_overview_performance`, scoped by listing and organisation, with shared completed-day periods and coverage. |
| Property24 Settings statistics operations/history | Retain pipeline operations | The existing sync action uses the phase 2 backfill endpoint. Stored/received counts describe ingestion runs, not listing views. The existing hidden panel and visibility are unchanged. |
| Property24 server ingestion, daily storage and historical SQL | Retain | The new cards depend on these records and services. Append-only migrations and historical database functions are unchanged; no live frontend code calls `property24_marketing_analytics` or `property24_listing_performance`. |

Website-owned views and digital-card events remain separate first-party measurements. Property24 listing/publication status, references, reconciliation and CRM lead imports are operational records and remain intact.

Verification: **32 tests passed** across Marketing service/UI, the frontend reader, channel cards, seller marketing and the database-backed channel integration suite. The eight existing focused checks for Property24 Marketing, listing rankings, insights, export retirement, Listing Overview wiring/phase 1/phase 3, and statistics operations pass. The phase 1 comparison assertion now reflects the phase 2 rule that incomplete coverage suppresses trends. ESLint reports no errors; existing warnings in unrelated ClientPortal code remain. The scoped whitespace check passes, and a focused production bundle of Marketing and its local service passes with workspace context, Supabase and third-party imports externalised.

Playwright checked the real Marketing component and service with organisation-scoped CRM fixtures and external network requests blocked. Legacy headings/export are absent, the period selector still updates, and the channel note wraps visibly. Desktop (1440px) and mobile (390px and 320px) pass width checks; the channel table scrolls within its card on mobile. No browser errors were recorded. Screenshots: [desktop](../output/playwright/legacy-p24-cleanup-desktop-20261008.png), [mobile channel table](../output/playwright/legacy-p24-cleanup-mobile-20261008.png). These show simulated CRM counts, not production data.

This cleanup is local source only. It does not apply migrations, change hosted data, activate integrations or deploy. The earlier full-app build limitation and hosted release/acceptance gates above still apply.

## Production sync diagnosis — 8 October 2026

Read-only checks against Arch9 SaaS (`isdowlnollckzvltkasn`) now confirm that both daily statistics tables, the Private Property access/run tables and the completed-day reader are installed. Neither provider has saved daily statistics yet. Property24's most recent production runs were at 02:15 UTC (04:15 South African time) and failed with HTTP 400 before storing counts. Private Property has no statistics runs or verified/enabled statistics access records; the production environment-variable inventory also lacks `PRIVATE_PROPERTY_STATISTICS_SYNC_ENABLED`.

Using each of the two production agencies' saved Vault credentials, read-only Property24 requests for 1–7 October succeeded for both Sale and Rental. Private Property returned a typed daily statistics row with a views field for one owned listing per production branch on 7 October. No credentials, listing counts or supplier payloads were persisted by these diagnostics. The supplier response behind the earlier Property24 HTTP 400 was not saved, so its exact validation failure remains unconfirmed. The latest production deployment advertises commit `54f4f76a57e83761f841b5bf5253433ef1299e5d`, whose scheduled statistics path includes the agency Vault credential resolver; the recorded failed runs predate that deployment.

Focused verification: 44 retrieval, database-reader, service and card tests pass, and `test:property24-statistics-sync` passes. No app code was changed by this diagnosis. The remaining operational step requires current-task approval: perform a bounded Property24 backfill, verify and enable Private Property statistics access for the two production branches, perform its bounded initial pull, and enable its scheduler flag. Verify saved daily rows and the listing Overview after those writes; supplier read access alone does not confirm that a live sync has completed.

### Approved initial production sync

The requester approved activation and bounded live syncs in this chat. At 15:38 UTC, Property24 completed its 8 September–7 October backfill for Kingdom Real Estate (179 daily rows) and ISellProperty (25 daily rows). All 25 ISellProperty rows and 42 Kingdom rows link to existing Arch9 listings; the remaining Kingdom supplier rows retain their portal identities without inventing an Arch9 listing mapping. Private Property passed its live access probe, then saved eight daily rows per agency with no pending supplier responses. Its run status is `partial` because the 90-day history still has deferred requests, rather than a failed sync.

The production Overview reader was checked with an existing active organisation member's transaction-local authentication context for all 12 listings with mapped saved statistics. Property24 counts and `lastAttempt.failed = false` are returned for all 12; Private Property counts, including confirmed zero, are returned for its five mapped listings. This is a hosted reader check plus passing service/card tests, not an authenticated browser acceptance check.

`PRIVATE_PROPERTY_STATISTICS_SYNC_ENABLED=true` was added to the existing Vercel `bridge` project's production environment. The existing production deployment was selected for a redeploy; local uncommitted application changes were not submitted. The activation deployment is `dpl_FLtEAztcnVWvc7mPkmnDXDcghGmy` (`bridge-30fwkmwc5-alexs-projects-f5496a21.vercel.app`) and reached `READY`; the production domains, including `app.arch9.co.za`, point to it. Vercel's project metadata confirms that Private Property's ten-minute cron and Property24's daily 02:15 UTC cron use this deployment. No migrations, listing publication, lead delivery or emails were performed by the activation commands.

At 15:50:19 UTC (17:50 South African time), the real automatic Private Property job ran for both enabled agencies. Each run made two requests and saved two additional daily rows, with no pending responses or error code. `last_scheduled_at` advanced for both access records. There are now 20 Private Property daily rows alongside the 204 Property24 daily rows from the initial backfill. Private Property remains `partial` while deferred historical requests are filled; this is expected and is not a failed pull. The shared scheduler secrets are sensitive and unreadable, so no secret was rotated to force a manual scheduled request. Property24's next automatic nightly invocation has not yet occurred; its bounded backfill and saved Overview response have been verified. No error/fatal logs were returned for the activation deployment in the bounded post-release scan.

Recovery: disable the two statistics access records to stop Private Property pulls immediately, then remove/disable the scheduler flag for future deployments. Preserve saved statistics. The prior production deployment is `dpl_7TKhSX9qQFFrpVLBUDtuRYU1u7jR`; it remains the application rollback target for this configuration-only redeploy.
