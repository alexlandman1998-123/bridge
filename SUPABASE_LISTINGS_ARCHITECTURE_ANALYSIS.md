# Supabase listings architecture analysis

Date: 2026-08-30

## Executive decision

Keep Supabase as the platform backend. Supabase is designed to provide Postgres, Auth, Data APIs, Object Storage, Realtime, and Edge Functions together. Splitting out a conventional application server solely because Supabase is being used as the backend would add operational complexity without fixing the current listing scalability risks.

The correct boundary is:

- Postgres: structured listing facts, lifecycle state, permissions, relationships, searchable/filterable fields, media metadata, and external publication state.
- Object Storage: image, video, PDF, and other file bytes.
- Edge Functions or API routes: authentication-sensitive orchestration, webhooks, short third-party calls, signing and publication commands.
- Background workers/queues: image transformations, large document generation, feed imports/exports, retries, and bulk portal syndication.
- CDN/object delivery: public listing media and optimized image variants.

The repository broadly follows the first two boundaries already. The urgent work is query-shape and workflow hardening, not moving away from Supabase.

## What the repository currently does

### Correct choices

1. Listing image bytes are uploaded to Supabase Object Storage under listing-scoped object paths. Postgres receives URLs and metadata rather than binary image data.
2. `listing_media` contains one metadata row per asset and has an index on `(listing_id, sort_order)`.
3. Structured publication fields live in `listing_publication_data`, separate from the main private-listing lifecycle record.
4. Existing partial indexes support organisation/agent listing access ordered by `updated_at` while excluding withdrawn or archived listings.
5. Storage and listing tables use RLS-based access controls.

### Scaling risks

#### P0 — unbounded listing-index reads

`getAgentPrivateListings` selects `*`, does not apply a range/limit, and then loads up to eight related datasets for the complete result set. Rental indexes explicitly request media as well. Growth therefore increases database work, response bytes, browser memory, and RLS evaluation together.

Impact: high. This is likely to become visible well before Postgres storage capacity is a concern.

Recommendation: use a dedicated, narrow listing-summary query/RPC with cursor pagination. Return only index-card columns and a single cover-media record. Target 25–50 rows per request.

#### P0 — media URLs are persisted as signed URLs

The upload path creates a 30-day signed URL and the distribution sync persists the selected URL into `listing_media.file_url`. This creates expiry and refresh problems and can turn normal gallery reads into broken images after the URL expires.

Impact: high for a growing public catalogue.

Recommendation: persist immutable `bucket` + `object_path` (and asset metadata), never a signed URL as canonical state. Generate short-lived signed URLs at read time for private assets. Put public marketing images in a public/CDN-backed bucket and persist the stable public object URL.

#### P1 — gallery synchronization is delete-and-reinsert

Every distribution sync deletes all media rows and reinserts the current gallery. This increases writes, WAL, RLS work, and race risk, and prevents stable media identity.

Impact: medium at ordinary listing volumes; high during bulk imports or frequent editing.

Recommendation: upsert by stable media ID/object path, update ordering separately, and delete only removed assets.

#### P1 — client-coordinated multi-step writes

Rental creation writes the listing, uploads the cover, writes distribution data, starts remaining uploads without awaiting them, and emits activity separately. A closed browser or failed request can leave partial state.

Impact: medium/high operational risk during bulk onboarding and unreliable networks.

Recommendation: use a durable job/outbox row after initial draft creation. Let a worker complete media processing, derived variants, syndication, and retries idempotently.

#### P1 — heavy and long-running function responsibilities

The repository contains large Edge Functions for signing and document generation. Supabase recommends Edge Functions for short-lived orchestration and background workers for CPU-heavy or long-running work.

Impact: independent of listing count initially, but listing growth can multiply concurrent media/document jobs and expose CPU/time limits.

Recommendation: retain thin Edge endpoints, but move rendering, image processing, bulk feed work, and retry loops to queued workers. These workers can still use Supabase as their database and storage layer.

#### P1 — public catalogue/search needs a distinct read model

Internal private-listing records carry workflow, onboarding, document, mandate, and seller state. A high-traffic catalogue should not hydrate this graph.

Recommendation: create a public listing projection containing publishable fields only. Query it through a narrow view/RPC or search service, with CDN caching. Add external search only when faceting, geo-search, typo tolerance, or measured Postgres query load justifies it.

## Expected impact by scale

These are architecture thresholds, not measured production limits. Actual capacity depends on query plans, compute size, cache hit rate, image sizes, and traffic concurrency.

| Scale | Current architecture outcome | Required response |
|---|---|---|
| Hundreds to low thousands of listings | Supabase is fully suitable; current unbounded reads may already feel slow for large agencies. | Add pagination and narrow summaries now. |
| Tens of thousands | Postgres remains suitable with indexes, but fan-out index reads and delete/reinsert media writes become costly. | Add projection/RPC, cursor pagination, stable media paths, and queued workflows. |
| Hundreds of thousands | Postgres can remain the source of truth, but public search and media delivery need independent read optimization. | CDN-first media, cached catalogue projection, load tests, and potentially a dedicated search index. |
| Large multi-portal bulk operations | Synchronous browser/Edge orchestration becomes unreliable regardless of raw row count. | Durable queues/workers, idempotency, backpressure, and reconciliation dashboards. |

## Recommended target architecture

1. Browser requests a narrow, paginated listing summary from Supabase.
2. Postgres serves structured summaries using indexed organisation/status/sort predicates.
3. Browser loads cover thumbnails from the CDN/object-storage layer, not through Postgres.
4. Detail pages fetch one listing and only the tabs/relations needed.
5. Uploads go directly to Object Storage using controlled paths and policies; Postgres stores stable object identity and metadata.
6. An outbox/queue triggers thumbnail generation, validation, syndication, webhook delivery, and retries.
7. Edge Functions authenticate commands and enqueue work; workers perform heavy processing.
8. A publishable listing projection isolates public catalogue reads from internal workflow data.

## Implementation order

### Phase 1 — before listing volume ramps up

- Introduce cursor pagination and a 25–50 row default limit.
- Switch listing indexes to narrow summary fields; fetch only cover media.
- Persist bucket/object path instead of signed URLs.
- Add page-size, query-latency, returned-row, and response-byte telemetry.
- Run `EXPLAIN (ANALYZE, BUFFERS)` for the agent, branch, organisation, status, and public catalogue paths using representative data.

### Phase 0 implementation status

Implemented on 2026-08-30:

- Runtime rental-listing index telemetry records duration, result count, estimated response bytes, media inclusion, and the known unbounded-query flag in the existing `performance_metrics` stream.
- A reusable baseline model defines the Phase 0 targets and inspects media rows for incomplete records and expired/near-expiry signed URLs.
- `scripts/listing-architecture-baseline.test.mjs` verifies the baseline calculations.
- `scripts/listing-architecture-baseline.mjs` performs an aggregate-only, read-only live inventory and writes the latest JSON and Markdown evidence under `docs/architecture-baselines/`.
- `sql/listing-architecture-phase0-baseline.sql` provides a read-only inventory, table/index statistics, and representative `EXPLAIN (ANALYZE, BUFFERS)` queries.

Run the automated verification with `npm run test:listing-architecture-baseline`. Run the live aggregate report with `npm run report:listing-architecture-baseline`. Run the SQL pack in the Supabase SQL Editor against staging first and preserve its output as the pre-Phase-1 benchmark.

### Phase 2 — before bulk import/syndication

- Replace delete/reinsert media synchronization with stable upserts.
- Add a durable outbox/queue and idempotent workers.
- Generate thumbnails and web-optimized variants asynchronously.
- Add reconciliation and retry status for Property24/Private Property publication.

### Phase 1 implementation status

Implemented on 2026-08-30:

- Rental listing indexes now use a narrow summary selector rather than `select('*')` and the full listing relationship graph.
- Cursor pagination is stable on `(updated_at desc, id desc)` with a 25-row default and enforced 50-row maximum.
- Organisation, branch, assigned-agent, RLS, visible-listing, and rental-category filters are applied before pagination.
- Only cover image metadata is loaded for the page; galleries remain detail-page data.
- The UI loads the first 25 records and explicitly requests additional pages.
- Existing Phase 0 telemetry now records page size, response bytes, result count, `coverOnly`, and confirms `unboundedQuery: false`.

### Phase 3 — when public traffic or search demands it

- Add a sanitized public listing projection.
- Put public media behind long-cache CDN URLs with versioned object keys.
- Add cache headers and invalidation on publication changes.
- Adopt a separate search engine only from measured need, not listing count alone.

### Phase 2 implementation status

Implemented on 2026-08-30:

- `listing_media` now has canonical `storage_bucket` and `storage_path` fields plus content type, byte size, dimensions, checksum, and processing state.
- Recoverable legacy Supabase signed/public/authenticated URLs are backfilled to canonical object identity.
- New uploads persist stable storage identity and metadata alongside the temporary `file_url` compatibility field.
- Private delivery URLs are generated in batches at read time with a one-hour lifetime; failed signing falls back to legacy delivery data.
- The application supports both pre- and post-migration schemas during staged deployment.
- The Phase 0 SQL evidence pack now reports canonical coverage and assets requiring repair.

### Phase 3 implementation status

Implemented on 2026-08-30:

- Gallery synchronization is now an atomic, RLS-bound, `SECURITY INVOKER` database operation.
- Existing media rows are matched by row ID or canonical Storage identity; reordering and caption changes update in place.
- Only explicitly removed media rows are deleted, preserving stable asset identity.
- A temporary legacy replace fallback supports deployments where the Phase 3 RPC is not installed yet.
- Upload validation enforces web image formats, a 25 MB limit, and a 50-megapixel limit before upload.
- Image width and height are persisted for new browser uploads.
- Listing-index cover images use Supabase Storage transformations at 640×480 and quality 75, reducing index egress without creating duplicate stored files.

### Phase 4 implementation status

Implemented on 2026-08-30:

- Tenant-scoped listing jobs are persisted transactionally with idempotency keys, scheduled availability, bounded attempts, worker leases, and RLS-protected operator visibility.
- Workers claim jobs with `FOR UPDATE SKIP LOCKED`, so concurrent invocations cannot process the same active lease.
- Retryable failures use exponential backoff; exhausted or non-retryable work moves to `manual_review` with a retained error code and message.
- The listing worker is deployed disabled by default and also requires a dedicated runner secret. Media reconciliation is the only activated handler.
- Portal publication, document, and webhook job types deliberately fail closed until their dedicated adapters receive a separate production activation decision.
- Rental creation now awaits every browser-owned upload before synchronizing media, then enqueues durable server-side reconciliation. This removes the previous detached browser upload that could be lost when the tab closed.

### Phase 5 implementation status

Implemented on 2026-08-30:

- Every queue status transition now creates immutable lifecycle evidence containing the attempt, worker, error code, and timing metadata.
- Event access is tenant-bound through listing RLS; clients receive no direct insert or update permission on the audit stream.
- Queue enqueueing applies transaction-safe per-organisation backpressure at 500 active jobs while preserving idempotent replay.
- An RLS-aware health endpoint reports active work, manual-review volume, expired leases, and the age of the oldest ready job without exposing job payloads.
- Client-side health evaluation defines warning and critical thresholds suitable for listing operations and support dashboards.
- Worker responses now expose completed, retry, manual-review, and duration measurements for scheduler logs and alerts.
- Live portal adapters and automatic worker scheduling remain disabled until a controlled activation phase.

### Phase 6 implementation status

Implemented on 2026-08-30:

- Organisation administrators can retry manual-review/failed jobs and cancel active jobs through narrowly scoped, RLS-bound RPCs.
- Operator actions retain job history and record the authenticated actor in the append-only lifecycle event.
- Every worker invocation writes service-role-only heartbeat evidence with batch totals, duration, outcome counts, and claim failures.
- A service-only health endpoint detects missing five-minute worker cadence and summarizes recent scheduler throughput and failures.
- The activation contract is explicitly inert, approves only media reconciliation for a future controlled schedule, and keeps all external publication handlers blocked.
- Rollback preserves queued jobs and audit evidence while disabling the schedule and worker function.

### Phase 7 implementation status

Implemented on 2026-08-30, awaiting controlled staging execution:

- A staging-only activation contract binds execution to the healthy `Arch9 Staging` project and explicitly refuses the production project.
- The smoke runner defaults to a read-only preflight and requires an exact confirmation phrase before creating one bounded media-reconciliation job.
- Execution verifies schema availability, selects only a listing whose media already has canonical Storage identity, and limits the worker batch to one job with one attempt.
- The resulting receipt proves queued/completed lifecycle events and service-only worker heartbeat evidence without retaining credentials or listing content.
- Property24, Private Property, document, webhook, and recurring-schedule activation remain outside Phase 7 and blocked.

### Phase 8 implementation status

Implemented on 2026-08-30, blocked on successful Phase 7 execution:

- A production-only canary contract binds execution to the `Arch9 SaaS` project and rejects staging or mismatched API URLs.
- Production execution requires an immutable `STAGING_SMOKE_PASSED` Phase 7 receipt and an exact production confirmation phrase.
- The canary refuses to start unless the production queue is idle and has no expired leases.
- It selects one listing with non-empty, fully canonical media, creates one one-attempt reconciliation job, and proves exactly-once completion, lifecycle events, and worker heartbeat evidence.
- Queue health is captured before and after the canary in a redacted receipt.
- Recurring scheduling and every external publication/document/webhook handler remain disabled.

### Phase 9 implementation status

Implemented on 2026-08-30:

- Listing images now have RLS-protected materialized variant metadata for thumbnail (320×240), card (640×480), and detail (1600×1200) delivery.
- A new durable `media_variant_refresh` job downloads Supabase-transformed images and uploads immutable derived objects with one-year cache headers.
- Derived object paths include the source checksum or canonical identity revision, so a source change produces a new URL and invalidates CDN/browser caches without overwriting the old revision.
- Variant metadata upserts by media and variant key; replaced derived objects are removed only after the new object and metadata are ready.
- Rental listing create/update now queues reconciliation followed by variant generation.
- Listing index cover reads prefer the materialized card object and fall back to the existing on-demand transformation during staged rollout.
- External portal publication handlers and recurring worker activation remain blocked.

### Phase 10 implementation status

Implemented on 2026-08-30, disabled pending migration/deployment and controlled activation:

- Property24 and Private Property publication jobs now dispatch from the durable queue to a private Node adapter, reusing the existing provider clients and sync-recording services.
- Only organisation administrators can enqueue syndication work, and every request requires an exact provider, listing, and environment confirmation captured with actor and timestamp evidence.
- The adapter independently validates queue approval evidence, authenticates worker-to-adapter calls with a dedicated secret, and returns only a redacted outcome summary.
- Provider-specific worker flags keep each integration disabled independently; production additionally requires a global production syndication switch.
- Missing adapter configuration, invalid evidence, and disabled gates fail closed without calling either portal.
- Provider calls remain unscheduled. Activation still requires applying the Phase 9 and Phase 10 migrations, deploying both workers, configuring secrets, and completing a bounded sandbox rehearsal before any production job.

### Phase 11 implementation status

Implemented on 2026-08-30, awaiting controlled staging execution:

- A staging-only syndication rehearsal contract supports exactly one Property24 or Private Property sandbox submission and explicitly rejects the production Supabase project.
- Execution requires an authenticated organisation administrator, an exact Phase 11 confirmation, a specific listing UUID, and an explicit provider mapping file.
- The rehearsal refuses to begin unless the staging queue is idle, invokes a one-job worker batch, and proves submission, lifecycle, and worker outcome evidence.
- A narrow admin-only health RPC reports aggregate syndication status by listing without exposing job payloads, credentials, or provider responses.
- A partial operational index keeps per-organisation provider/environment health checks bounded as syndication history grows.
- Successful rehearsal evidence is written as a redacted local receipt. Production activation and recurring scheduling remain disabled and are not part of Phase 11.

### Phase 12 implementation status

Implemented on 2026-08-30, awaiting Phase 11 rehearsals and staging certification:

- Phase 11 now preserves separate Property24 and Private Property rehearsal receipts so one provider can no longer overwrite the other's evidence.
- The certification gate accepts only recent, successful sandbox receipts from the approved staging project and rejects the production project before making network calls.
- Live certification proves the materialized-variant schema, controlled enqueue history, admin-only health RPC, queue worker deployment, and private adapter deployment.
- The private adapter exposes an authenticated, credential-free readiness response showing only provider activation and the production kill-switch state.
- Certification requires both provider workers enabled in staging while requiring production syndication to remain disabled.
- Remote rehearsal jobs are re-read from staging and must still contain completed submission evidence; local receipts alone are insufficient.
- A successful certification creates a redacted readiness receipt with a SHA-256 evidence digest. It does not enable production or create a recurring schedule.

### Phase 13 implementation status

Implemented on 2026-08-30, not executed:

- The production syndication canary is cryptographically bound to a valid Phase 12 staging certificate and refuses staging or any unapproved production project.
- A dedicated admin-only canary RPC permits exactly one attempt for one explicitly confirmed provider and listing while refusing an organisation with active production syndication work.
- Execution requires an explicit production mapping file, authenticated organisation administrator, provider-specific production activation, an idle queue, and an exact listing-bound confirmation phrase.
- The canary reuses the durable queue and worker, then requires exactly-once completion, lifecycle evidence, a clean post-run queue, and provider-specific production sync evidence.
- The receipt stores redacted queue, provider sync, and health evidence with a SHA-256 digest.
- Rollback starts by disabling the selected provider worker, cancelling queued production work, using the existing provider withdrawal/inactive workflow, and preserving all audit evidence.
- Bulk publication and recurring scheduling remain disabled and are outside Phase 13.

## Go/no-go conclusion

**Go with Supabase as the backend and database.** There is no architectural reason to replace it now. Supabase Storage is also an appropriate home for listing assets; using it does not place the file bytes in the Postgres database.

**Do not go live with large listing batches on the present unbounded list query and expiring signed-URL persistence.** Those two issues should be corrected first. Heavy processing should move behind durable asynchronous jobs as bulk ingestion and portal syndication increase.

## Evidence and limitations

This review is based on repository code and migrations, plus current Supabase architecture and performance guidance. It did not inspect production row counts, query plans, compute utilization, database size, Storage egress, cache hit rate, or p95 latency. A capacity conclusion requires those live measurements and a representative load test.
