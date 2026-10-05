# Revo Properties external website integration, API v1

This rollout is restricted to Revo’s existing organisation
`322c3853-2d82-4413-97e6-b4cd8bc32a7c`. Each main or development website has its
own stable connection, credentials, scope and activity. A leads-only development
website does not receive listing data. The supplied property experience includes
ready-made cards, search, detail pages, photography galleries and enquiries.
Installing it on Revo’s website is a separate activation step; this work does
not change the existing Prop Data arrangement, domains or redirects.

## Existing infrastructure reused

The primary Arch9 Vite workspace owns the screen and Vercel API. Supabase owns
configuration, scope enforcement and the durable outbox. `private_listings`,
`listing_publication_data` and marketing `listing_media` remain the listing
source. No separate listing database is introduced.

The installed `website_capture_lead_submission` command is factored into one
shared internal command. Its original public signature remains a wrapper for
hosted websites. External enquiries use the same contacts, leads, activities,
rental classification, principal notification rule and durable email dispatcher.
The migration asserts expected installed function markers before adapting them;
an unexpected intake version fails the migration for review.

## Administrator setup

Open **Settings → Integrations → External Websites** as an authorised Revo
organisation administrator. Existing agency permission rules apply. Create a
website, select leads only or listings and leads, and choose organisation,
selected branches or one Revo-owned development. Choose an active fallback
assignee; a branch-scoped fallback must belong to a permitted branch.

The listing’s active Revo agent is the first enquiry assignee. If unavailable,
the configured fallback receives assignment. Principal notifications follow the
existing website rule. An inactive fallback causes a useful rejection instead
of silently losing assignment. Enquiries carry their connection, listing and
optional development relationship, source page, campaign and consent evidence
in the canonical receipt and CRM enquiry snapshot.

API and webhook credentials are shown only on create/rotate. Save them in the
website backend’s secret store. API credentials are hashed with SHA-256; webhook
signing secrets use the existing Supabase Vault convention. Rotating immediately
invalidates the old API credential and signing secret. Revoke blocks API access
and cancels pending webhook attempts. Disable also blocks reads/submissions and
future deliveries. A request already underway may finish. Re-enable emits current
state and any needed removals for reconciliation.

Agent/branch names and contact details require the explicit **Approve public
agent and branch names, email and telephone** setting. Street addresses and exact
coordinates are always omitted in v1. Sold/rented stock is excluded by default;
connection settings can retain it only while its existing publication remains
Published and visibility remains active market. Withdrawn, archived and internal
stock stays excluded. Private documents and seller/internal fields never enter
the response. Only HTTPS marketing media with safe public URLs is returned.
Already prepared active `website_listing_media_assets` copies are reused when
they match the source media and belong to a site in the same organisation.
Retiring a copy produces a listing update. Private or expiring signed source
links are omitted; prepare public marketing images through Arch9’s existing
media/publication workflow where necessary.

## Authentication and transport

Base: `https://<Arch9-app-host>/api/integrations/v1`

Use `Authorization: Bearer <website-credential>` on every request. The organisation
and connection come from this credential. No caller-supplied organisation, branch
or agent can control lead assignment. The credential is for server-to-server use;
never embed it in frontend bundles, HTML, public environment variables or URLs.
HTTPS is required for the website, source page and outgoing webhook endpoint.
There is no browser CORS integration.

Responses use `Cache-Control: private, no-store`. The website backend may cache
approved listing data and expose its own public rendering/data endpoint. Purge
its listing cache if access becomes disabled, revoked or leads-only (401/403).
Limit the public website form, add CAPTCHA/honeypot where appropriate and rate
limit individual visitors before proxying to Arch9; Arch9 limits each authenticated
connection to 120 API requests/minute and 30 new enquiries/minute. Idempotent
retries do not consume the new-enquiry limit. Maximum enquiry body: 16 KiB.

## Endpoints

| Method | Path | Result |
|---|---|---|
| GET | `/listings` | Approved properties in connection scope, pagination and feed high watermark |
| GET | `/listings/:id` | One approved property, or 404 |
| GET | `/changes?cursor=0&limit=100` | Durable publication/update/removal events for this connection |
| POST | `/leads` | Existing CRM lead/enquiry receipt, or a validation error |

`/listings` filters: `transactionType=sale|rental` (`listingType` is an alias),
`propertyType` (case-insensitive exact value), `location` (case-insensitive substring
of suburb/city/province), `minPrice`, `maxPrice`, `bedrooms` (minimum), `branchId`,
`developmentId`, `updatedSince` (ISO timestamp, inclusive). Filters can narrow
approved scope, never widen it. Sorting: `updated_desc` (default), `price_asc`,
`price_desc`, with stable ID tie-breaks. `limit` 1–100 (default 25); `offset` 0–100000.
Each response includes `{schemaVersion:1,data:[...],pagination:{limit,offset,total},
highWatermark:"<sequence>"}`. Do not use offset paging alone for a reliable initial
cache import: initialise through the change feed from cursor 0, fetching the
current property for each event, then retain the cursor.

Single-property response: `{schemaVersion:1,data:{...}}`. Listing fields:

```json
{
  "id": "stable-listing-uuid",
  "reference": "ARCH9-reference",
  "title": "Public title",
  "description": "Approved description",
  "price": 2000000,
  "currency": "ZAR",
  "propertyType": "Apartment",
  "transactionType": "sale",
  "location": {"suburb": "Sea Point", "city": "Cape Town", "province": "Western Cape"},
  "bedrooms": 2, "bathrooms": 1, "parking": 1, "garages": 0,
  "size": {"floor": 80, "land": null, "unit": "m2"},
  "photos": [{"url": "https://public.example/photo.jpg", "caption": "View", "order": 0}],
  "media": [{"type": "floor_plan", "url": "https://public.example/plan.pdf", "caption": null, "order": 1}],
  "agent": null,
  "branch": {"id": "branch-uuid"},
  "development": {"id": "development-uuid", "name": "Development name"},
  "status": "published",
  "publishedAt": "2026-10-04T12:00:00Z",
  "updatedAt": "2026-10-04T12:01:00Z",
  "version": "123"
}
```

`agent` becomes `{id,name,email,phone}` and `branch` additionally has
`{name,email,phone}` only after contact approval. Development can be null.
Nullable unknown details stay null. Public status is published, sold, rented or
let according to source status and retention settings. `version` and cursors are
strings to avoid JavaScript integer rounding. Publication time is the first
external publication record; versions advance on listing/public projection/media
changes, related public details and connection scope/publication configuration.

## Enquiry submission

Required: name (2–160), email (≤254) and/or phone (≤64), sourcePageUrl (≤2048,
belonging to this connection’s website), consent. Optional: message (≤4000),
listingId, developmentId and campaign values. Listing targets must be public and
within scope even for leads-only connections; developments must be Revo-owned
and within scope. If both targets are provided they must match. A development
connection also records its configured development for general enquiries.

Provide an `Idempotency-Key` header, `idempotencyKey`, or `externalSubmissionId`
(16–128 letters/numbers/dot/underscore/colon/hyphen). Persist one key per enquiry
and reuse it for network retries. A new property enquiry needs its own key even
for the same person. A repeated key with a different normalised payload returns
409. Matching retries return the original lead/enquiry without repeating contact,
activity, lead, task or notification creation.

```json
{
  "name": "Example Buyer",
  "email": "buyer@example.test",
  "phone": "+27820000000",
  "message": "Please arrange a viewing.",
  "listingId": "approved-listing-uuid",
  "sourcePageUrl": "https://your-revo-website.example/property/example",
  "idempotencyKey": "website-form-unique-submission-0001",
  "utm": {"utmSource": "google", "utmMedium": "cpc", "utmCampaign": "launch"},
  "consent": {
    "privacyAccepted": true,
    "wording": "Use my details to respond to this enquiry.",
    "wordingVersion": "enquiry-privacy-v1",
    "marketingConsent": false
  }
}
```

Success: 201 for a new enquiry, 200 for a retry:
`{accepted:true,duplicate:false,connectionId,leadId,enquiryId}`. CRM contact matching
is shared; different-property enquiries remain separate lead records. Consent
evidence and server acceptance time are retained in the receipt. Marketing is
never inferred from enquiry acceptance and no new client marketing automation
is enabled. Existing internal principal/bell/email follow-ups are queued once
and dispatched by the existing permitted notification engine.

## Errors

JSON `{error,message}` (invalid JSON/oversize handlers may return only `error`).
400 invalid fields/filters/consent/URL or mismatching targets; 401 unavailable
credentials/disabled connection; 403 listings disallowed; 404 unavailable or
out-of-scope target; 405 wrong method; 409 conflicting idempotency key; 413 >16 KiB;
429 rate limit (`Retry-After: 60`); 503 backend unavailable. Do not retry a 400/404
unchanged. Retry transient network/503/429 failures with the same submission key.
Logs retain outcome codes and IDs, never credentials or enquiry contents.

## Webhooks and reconciliation

Configure an HTTPS webhook URL. Events contain no property snapshots:

```json
{"id":"event-uuid","type":"listing.withdrawn","schemaVersion":1,
 "connectionId":"connection-uuid","listingId":"listing-uuid",
 "occurredAt":"2026-10-04T12:01:00Z","version":"124"}
```

Types: `listing.published`, `listing.updated`, `listing.withdrawn`. The last type
covers withdrawal, loss of approval/scope, deletion and sold/rented exclusion.
Verify `X-Arch9-Signature` (`sha256=<hex HMAC-SHA256>`) against the exact raw body
with the one-time webhook secret. The signed string is
`X-Arch9-Timestamp + '.' + rawBody`. Reject timestamps older/newer than five minutes
and compare signatures in constant time. `X-Arch9-Event-Id` matches event `id`.
Return a 2xx only after durably accepting the event. Fetch the current property
through the authenticated API instead of treating events as snapshots.

Delivery is at least once. Keep event IDs or listing versions persistently,
serialize updates per connection/property, and ignore older/repeated versions.
Keep a tombstone version even after deleting a cached property. A delayed
withdrawal must not erase a newer republication: fetch the current property;
if present retain its newer version, if 404 remove it. Never advance a change
cursor until every event on that page has been durably applied.

The Vercel worker claims up to 20 deliveries per run. Network, 408, 429 and 5xx
failures retry with 30s exponential backoff capped at one hour, up to 8 attempts.
Other 4xx (and other non-transient responses after attempt exhaustion) remain
failed and visible; administrators can retry a selected failed delivery. Claims
interrupted for two minutes are reclaimed; completion requires the current
claim ID, preventing an old worker from overwriting a new attempt. HTTPS
DNS/IP validation rejects private/local destinations, pins the validated address
and follows no redirects. Delivery logs store status/error codes only.

`GET /changes` is the reconciliation mechanism: request the saved cursor (or 0),
process the ordered page, persist `nextCursor`, and repeat while `hasMore` is true.
Responses also include `highWatermark`. Events/tombstones are retained indefinitely
in v1; disabling does not delete them. Row locks serialize event sequences and
feed reads per connection so the cursor cannot skip an uncommitted earlier event.
Run reconciliation periodically even when webhooks seem healthy.

## Working backend examples

See [examples/external-website-client.mjs](examples/external-website-client.mjs).
It implements listing fetches, a property fetch, enquiry submission, raw-body
signature verification and a cache that handles missed/repeated/out-of-order
updates and removals. For example, in your server:

```js
import { createArch9WebsiteClient, createExampleListingCache, verifyArch9Webhook }
  from './external-website-client.mjs'
const client = createArch9WebsiteClient({
  baseUrl: process.env.ARCH9_BASE_URL,
  credential: process.env.ARCH9_WEBSITE_CREDENTIAL,
})
const results = await client.listings({transactionType: 'sale', limit: '25'})
const property = await client.property('approved-listing-uuid')
const enquiry = await client.enquiry({ /* validated payload as above */ })
const cache = createExampleListingCache(client, process.env.ARCH9_CONNECTION_ID)
await cache.reconcile() // initial import and recovery, including withdrawn stock
// Your webhook route must read rawBody BEFORE parsing JSON:
if (!verifyArch9Webhook({secret: process.env.ARCH9_WEBHOOK_SECRET,
  timestamp: request.headers['x-arch9-timestamp'],
  signature: request.headers['x-arch9-signature'], rawBody})) throw new Error('Invalid webhook')
await cache.applyEvent(JSON.parse(rawBody))
```

Replace the example’s in-memory Maps/cursor with durable storage and a transaction
or lock per connection. Save the enquiry submission key on the website before
posting; queue retries there after network failures. Use an optional frontend
public proxy for listings; the Arch9 credential always stays on the backend.

## Release and verification boundary

No remote migration, connection, notification or deployment is created by the
local checks. The non-production example is an in-process PostgreSQL fixture
using the Revo identity and `revo.example.test`; Vault/auth/network providers
are simulated. The complete new SQL, API and real administration component run
against that local database. Existing listing and hosted enquiry checks also run.

Before authorised activation, use the repository’s guard/runbook, apply the new
migration, deploy the primary app API/UI and cron, and confirm these server-only
runtime settings: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
Supabase Vault and the existing `website-lead-dispatcher`/email runtime must be
available. The new Vercel cron runs every minute on a deployed production project;
a preview needs an explicitly authorised manual cron invocation. Do not use a
real Revo website URL for testing; create an example connection on an authorised
non-production environment first.

Verify scoped listings, an actual received webhook, a retried failure, accepted
CRM enquiry/assignee, unchanged retry, separate-property enquiries and old-key
revocation there. Live Vault encryption, deployed auth and actual email/webhook
delivery remain release acceptance checks. Revo’s developers can install the
supplied cards, search, property pages and form, then connect the server proxy
and visitor abuse protection. A persistent cache, signature handler and periodic
reconciliation are needed if the website caches the feed. The supplied browser
client reads current API data without caching and handles withdrawn deep links.
Prop Data migration, DNS and URL redirects are separate projects.

## Ready-made Revo property section and design preview

Source: `src/modules/revo/website/`. The reusable component accepts the same
approved v1 property projection as the API; preview data is a separate module.
The standalone mount bundles React and works in a normal HTML page, including
sites whose own frontend is not React. The section can keep Revo’s existing
header/footer (`showBrandFrame: false`, the embed default). Colours, typography
and spacing use scoped CSS; review the design with Revo before activation.

The visual direction follows [Revo's current homepage](https://www.revo-property.co.za/):
deep green, lime and mint accents, a warm off-white canvas, generous typography,
portrait property photography, integrated captions and round action buttons.
The asymmetric photo gallery leads the property page. A single light summary
panel groups the title, location and muted property facts. Matching light
containers group the description and property details, with the same padding,
borders and rounded corners. One aligned right
column contains the compact green price card, agent card and a softer mint
application card. Large slogans, numbered section labels and redundant jump
links have been removed. On mobile the summary, price and contact cards stack
beneath the photography ahead of the longer description.
Inline gallery arrows browse the photographs on desktop and mobile, with the
same keyboard-accessible full-screen viewer. Property details use the same
colours and rounded gallery controls. The font
stack reuses Revo's Klarheit Grotesk if their website already loads it; the
standalone demo uses a local sans-serif fallback and ships no proprietary font.
Property names, prices and photography remain illustrative demo data.

Property pages pair the overview, description and facts with a right-hand agent
column. The agent card uses approved agent details (or the Revo team fallback),
a viewing action that prefills the enquiry, and an expandable message form. The
demo includes a clearly labelled fictional agent and keeps enquiries local.
On narrow screens the contact and application cards follow the photography and
key facts, ahead of the longer description and details. A contextual enquiry
shortcut appears while reading further down the page, when neither the gallery
nor the contact/application cards are visible. It returns to the agent and does
not cover the photo arrows, enquiry form or application controls.
Below the agent is a home-finance card for sales or an application card for rentals.
The preview buttons open illustrative application journeys and collect no application
data. For the live widget, provide `bondApplicationUrl` and/or `rentalApplicationUrl`
to `mountRevoProperties` (also supported on the React components). Only a configured
HTTPS link for the current property type is shown; sold/let properties omit it.
Choose and approve the destination with Revo before activation. This is a link to
their secure provider, not a new banking, finance or rental application backend.

From the primary package:

```sh
npm run preview:revo-properties
npm run build:revo-properties
npm run test:external-websites
```

Public listing-only demo (4 October 2026):
[Revo listings](https://app.arch9.co.za/demo).
Vercel project: `arch9-revo-property-preview`; deployment:
`dpl_BUwvwDbVpQ4DVNm7ZVUMnGWknBpJ` (preview). The pinned origin is
`https://arch9-revo-property-preview-lbbj6rkgo-alexs-projects-f5496a21.vercel.app`.
Deploy only the generated static
preview into this project. Run Vercel from a clean copy of that static directory,
pass its `vercel.json` using `--local-config`, and use explicit `--target preview`
so the primary application's deployment configuration is not inherited. Never connect real
listings/enquiries or credentials here. It is publicly shareable for design
review, and separate from Arch9’s production app and Revo’s actual website.

For the branded path, build from the primary package with
`node scripts/revo-property-preview.mjs build --base=/demo/`. This prefixes
scripts, styles and sample images with `/demo/`. A published external rewrite
on the existing `bridge` hosting project (`prj_rbfXykMU6mU1eECbc0lJS9sPspmp`)
keeps that address in the browser. It matches host `app.arch9.co.za` and the
case-sensitive regex `^/demo(?:/((?:assets|images)/[^/]+))?/?$`, forwarding to the
pinned origin above with `/$1`. Existing client paths such as
`/demo/homeseekers`, `/demo/young-law` and `/demo/tuckers-attorneys` are excluded.
The rule adds `X-Robots-Tag: noindex, nofollow`.

Routing rule: `1b2cbf1c-4398-4c30-acd8-56dfcfdb8df4`; live routing version:
`b01619c6-d78d-4436-90ad-d585b687dde9`. This required no DNS change or primary-app
deployment. For later demo updates, deploy a new isolated build with the same
base, update only this rule's origin and publish the routing version. To roll
back, disable only this rule and publish; do not restore the earlier broad
`/demo` routing version, which included existing client paths.

The local preview is `http://127.0.0.1:4190`. The build produces two separate
generated directories, neither of which is source to commit:

- `output/revo-property-preview`: a static design preview with six illustrative
  properties and optimised local images. There is no database, credential, live
  API connection or enquiry submission. It opens directly with the listing grid
  and a sample-data label; the header/footer, introductory copy and filters are
  omitted. Cards open shareable property details, photo galleries, a demo agent
  card and a preview-only enquiry form. Application buttons show sample journeys.
  HTML and response headers exclude search indexing. Share this demo for UX/UI
  refinement, keeping it separate from the production integration.
- `output/revo-property-widget`: `revo-properties.js` and `revo-properties.css`
  for the real website. It contains no sample properties or credential. Copy
  these assets into the website’s own public asset directory using its normal
  deployment process.

Example installation on Revo’s property page:

```html
<link rel="stylesheet" href="/arch9/revo-properties.css" />
<div id="revo-properties"></div>
<script type="module">
  import { mountRevoProperties } from '/arch9/revo-properties.js'
  mountRevoProperties(document.getElementById('revo-properties'), {
    apiBasePath: '/api/arch9',
    showBrandFrame: false,
    // Optional: approved HTTPS destinations supplied by Revo.
    // bondApplicationUrl: 'https://your-approved-finance-provider.example/apply',
    // rentalApplicationUrl: 'https://your-approved-rental-provider.example/apply',
  })
</script>
```

Opening a card stays on this website, with a shareable `?property=<listing-id>`
address. Browser back/forward works; a withdrawn property shows an unavailable
page with a return to the current collection. For React websites, import
`RevoPropertyWebsite` and its stylesheet directly instead. Developers with an
existing router can use `RevoPropertyExperience` with `propertyId`, `onNavigate`
and `propertyHref` to retain their existing property URL convention. This client
renderer does not add server-rendered SEO metadata/canonical URLs; add those in
the website’s own framework if required before replacing existing indexed pages.

The required server endpoint is provided as a framework-neutral WHATWG
Request/Response adapter in [examples/revo-website-proxy.mjs](examples/revo-website-proxy.mjs).
Wire it to `GET /api/arch9/listings`, `GET /api/arch9/listings/:id` and
`POST /api/arch9/leads` using the website’s actual server/router:

```js
import { createRevoWebsiteProxy } from './revo-website-proxy.mjs'
const handlePropertyRequest = createRevoWebsiteProxy({
  arch9BaseUrl: process.env.ARCH9_BASE_URL,
  credential: process.env.ARCH9_WEBSITE_CREDENTIAL,
  websiteOrigin: 'https://your-approved-revo-host.example',
  approveEnquiry: verifyAndRateLimitWebsiteVisitor,
})
// Pass the incoming framework Request to handlePropertyRequest and return its Response.
```

`verifyAndRateLimitWebsiteVisitor` is supplied by Revo’s server: return `true`
after its visitor limit/bot checks, or a rejection Response. This callback is
mandatory for enquiries; a missing guard returns 503 without sending a lead.
The adapter checks source origins, limits bodies to 16 KiB, permits only the
three public routes, keeps the credential server-side, refuses redirects and
returns upstream errors. It does not forward browser-supplied auth headers.
The form records separate privacy/marketing consent, campaign and source page;
unchanged retries keep the same submission key, and thank-you appears only after
an accepted response with a CRM lead ID.

The live handover includes the approved UI assets, installation code, activated
API base URL and a private connection credential delivered securely to the
website developer. Sending a preview link alone does not install the integration.
Before a live URL can be handed over, approve the design, authorise the database/
app release, create the scoped connection for the real website, install its
server adapter and assets, and verify current listings, withdrawal and actual
CRM routing/notification delivery. Publish the final website only after those
acceptance checks.

## Local verification results — 4 October 2026

- Branded `/demo` path: isolated base-path build, focused builder/fixture ESLint
  and all eight property-interface tests passed. Local browser checks confirmed
  six listing images, detail navigation, three gallery images, mobile layout and
  return navigation under `/demo`, without browser errors. The published rule's
  exact source/host/origin and live version were read back from the hosting API;
  route-match checks exclude existing client demo paths and other app routes.
  The isolated origin deployment reports Ready. The remote page itself was not
  fetched as part of these checks; all listings and enquiries remain mock/local.

- Description/details containers: isolated preview and widget builds passed.
  Local desktop and 320/390px mobile browser checks confirm matching light
  cards, responsive padding, readable text and unclipped detail rows, with no
  horizontal overflow or browser errors. This revision changes scoped CSS only.

- Calmer property layout: isolated preview/widget builds, focused JSX ESLint
  and all eight property-interface tests passed. Local desktop checks confirm
  the summary and price share a top alignment and the three sidebar cards share
  a width. Desktop, tablet and 320/390px mobile checks cover sale/rental price
  fitting, unclipped facts, stacked cards, viewing-message prefilling, keyboard
  application closing and restored focus. No horizontal overflow or browser
  errors were found. Enquiry and application submission behavior is unchanged.

- Gallery-first cleanup: preview and widget builds, focused JSX ESLint and all
  eight property-interface tests passed. Local desktop, tablet and 320/390px
  mobile checks confirm the gallery appears before the heading, the price card
  sizes to its content and sale/rental prices fit. The full-screen gallery
  supports keyboard navigation, Escape and focus restoration after the move.
  No horizontal overflow or browser errors were found.

- Separate heading/price cards: isolated preview and widget builds, focused JSX
  ESLint and all eight property-interface tests passed. Local browser checks at
  1280px desktop, 768px tablet and 320/390px mobile widths confirm matching-height
  desktop cards, stacked mobile cards and unclipped rental/sale prices. No
  horizontal overflow or browser errors were found.

- Further design refinement: preview and widget builds, focused ESLint and all
  eight property-interface tests passed. The additional test covers inline photo
  selection and wraparound. Browser checks at desktop, tablet and 320/390px mobile
  widths confirm the listing grid, title/price/gallery layout, gallery arrows,
  keyboard viewer and focus restoration, contextual enquiry shortcut, viewing
  prefilling and preview validation. Application-dialog closing restores focus.
  There is no horizontal overflow, missing image or browser error, and the demo
  makes no enquiry/API submission.
- Agent/application sidebar: isolated preview and widget builds, focused ESLint
  and all seven property-interface tests passed. Desktop/mobile checks cover sale
  and rental cards, viewing-message prefilling, local-only enquiry validation,
  application-dialog keyboard closing and focus restoration. Live application
  links are checked for HTTPS and the matching transaction type. No preview API,
  CRM or application submission occurs.
- Revo brand refinement: both isolated builds and focused JSX/fixture ESLint
  passed. All five property-interface tests passed on an isolated rerun after
  the first concurrent run exceeded one test's timeout. Desktop, tablet and
  mobile layouts have no horizontal overflow; all six mock photos load, card
  captions fit, and keyboard gallery navigation restores focus when closed.
  That earlier listing-only preview omitted enquiries and had no browser errors;
  the subsequent sidebar revision adds the local-only demo form described above.
- `npm run test:external-websites`: passed 16 backend/example/proxy tests and 8
  administration/property-interface tests. The complete new migration executes against the
  PostgreSQL fixture. Checks include Revo/admin isolation, branch/development
  scope, draft/private-field exclusion, ordered safe media and reuse of approved
  public copies, updates/removal, routing, separate-property enquiries, consent,
  duplicate prevention, credential revocation, delivery retries and rate limits.
  The real browser-client/server-adapter/API/database round trip verifies scoped
  reads, accepted CRM routing, duplicate prevention, withdrawals and revoked access.
  UI checks include filters/reset, unavailable properties, preview no-send,
  consent/attribution, retry keys and requiring a confirmed lead receipt.
- `node --test server/tests/homeSeekersLeads.test.js
  server/tests/homeSeekersWebsiteBridge.test.js
  server/tests/publicListingsService.test.js`: passed 17 regression tests. The new
  integration tests also exercise the hosted intake wrapper after the migration.
- `npm run test`: passed all nine established primary-app service test groups.
- `npm run build:revo-properties`: passed the isolated static preview build and
  the standalone widget library build. Focused ESLint for the visual components,
  clients, examples, fixtures and builders: passed.
- Desktop/mobile browser checks: cards/search, detail navigation, keyboard gallery
  with focus restoration and preview form validation; no overflow, missing images
  or browser errors. The preview makes zero enquiry/API requests.
- Built standalone widget browser acceptance against the actual local API/SQL
  fixture: enquiry confirmed with a CRM lead assigned to the Revo agent, withdrawal
  unavailable on reload and back to the current collection; zero browser errors,
  with the credential confined to the server adapter. This test does not prove
  live email delivery or a connection to Revo’s actual website.
- Focused ESLint for the new backend, routes, UI, fixtures and examples: passed.
- `npm run build`: passed. A final setup-URL wrapping adjustment was subsequently
  checked with UI tests, lint and the browser.
- Local database browser preview: created a real fixture connection, displayed
  credentials once, hid them, saved a development scope, disabled the connection,
  revoked credentials and refreshed persisted state. Desktop and mobile views
  checked; zero browser console errors. Screenshots contain no credentials.
- Root `npm run check:app`: stopped at existing repository-wide lint failures
  (1,830 errors, including generated deployment files). No new feature files
  were reported; the focused checks, baseline and build above ran separately.

To reproduce the administration preview without remote access, run
`node server/tests/externalWebsitesPreview.js` from the primary package and open
`http://127.0.0.1:4189/server/tests/fixtures/external-websites-preview.html`.
Its temporary database disappears when the process stops. This fixture does not
send webhooks/email or use live Supabase credentials.

The listing-only demo refinement passed the five established property-interface
tests, focused ESLint and both preview/widget builds. Its local browser checks
covered six mock cards, navigation, keyboard gallery, desktop/mobile layouts,
all images loading on scroll and zero browser errors/API calls. Start the local
server with `npm run preview:revo-properties`; it reloads when source changes.
