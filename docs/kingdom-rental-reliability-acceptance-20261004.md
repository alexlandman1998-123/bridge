# Kingdom / I Sell rental reliability acceptance — 4 October 2026

Owner: primary `the-it-guy/` Arch9 workspace and shared rental migrations.

Local acceptance infrastructure and the expiry correction are implemented. Actual
signed-in account acceptance is **pending**. This is not production certification.
The original repair release is recorded in
[production verification](kingdom-rental-production-verification-20261004.json).
The additional reliability changes have not been deployed by this task.

## Findings corrected

The P24 date-only control previously called the full rental capture save. A legacy
rental without an occupation/availability date could not save expiry. That path also
submitted the editor's other fields instead of restricting the change to expiry.

`save_rental_listing_expiry_v1` now locks the rental, checks authenticated access,
rental availability, future date and the exact editor version, updates only the
canonical P24 expiry and timestamps, and records before/after history in the same
transaction. History failure rolls back the update. Publication data, photos,
video, tour, floor plans, external links, mandate expiry and unrelated facts stay
unchanged, including on incomplete rentals without a publication projection.
The client requires an audit receipt and confirmed readback. A lost response or
readback is explicitly unconfirmed; reload reveals any committed date. No expiry
is sent to a portal by this control.

## Local evidence

| User outcome | Evidence | Result |
| --- | --- | --- |
| Organisation switcher offers I Sell Property and Kingdom Realty | Real switcher in browser; real rental scope check hides old rental after switching and restores it on return | Pass, simulated memberships |
| Principal, branch and assigned-agent scope; late responses and browser draft isolation | Workspace and create/detail component regression tests | Pass, fixtures |
| Creation retry and refresh do not duplicate or replace an accepted rental | Creation component tests plus real PostgreSQL primary-key/lost-response/concurrent-insert tests | Pass locally; not a signed-in browser creation |
| Private photo identity and refreshed links | Storage identity/signing and cover tests; migrated gallery readback | Pass, mocked Storage signing |
| Removing a cover survives reload and preserves video/tour/floor plan | Real Marketing control → real save service/RPC → migrated PostgreSQL; one replacement cover and before/after history | Pass in browser |
| Guided edits save video and virtual tour links | Real guided edit route → real save service/RPC → PostgreSQL → Marketing links | Pass in browser |
| Legacy rental can save only P24 expiry | SQL access/stale-date/rollback tests plus browser date save and reload; mandate expiry stays separate | Pass |
| Committed date with failed readback remains recoverable | Browser failure injected after RPC commit; no success message; authoritative reload retains date | Pass |
| Listing checks show specific issues | Real readiness UI and preview client with intercepted portal preview response | Pass in browser, provider fixture |
| Website channels and portal columns remain present | Real Agency/Kingdom website components and Marketing channel table with fixture connections | Pass in browser, connection fixtures |
| Uncertain portal request prevents another send and offers reconciliation without reference | Browser blocked Publish/status controls and local reconciliation fixture; 15 server recovery tests with real journal constraints and mocked providers | Pass locally |
| Save history is durable and actor attributed | Real migration checks, history pagination/model and stock-review tests | Pass |

Final focused run: **129 Vitest tests and 26 Node tests passed**. The existing
`test:rental-listing-distribution-review` also passes both executable PostgreSQL
persistence and isolated-expiry suites. No remote database, Storage, email, website
publication or property portal was written by these checks.

`npm run check:app` passed lint (0 errors; existing warnings), the established
baseline and production build after the date-only change. A final focused lint,
expiry service test and production build passed after the uncertainty message was
strengthened. Local runtime: macOS, Node 24.11.1; package production engine is 22.x.
Build warnings about bundle sizes and old Browserslist data remain.
Desktop (1440px) and mobile (390px) Marketing screenshots were inspected; the
mobile page width is 390px with no horizontal overflow. Local screenshots are
`output/playwright/rental-marketing-desktop.png` and
`output/playwright/rental-marketing-mobile.png`.

Browser evidence uses `scripts/rental-listing-browser-fixture.mjs`. It binds to
loopback only, applies the shared isolated PostgreSQL fixture, and uses a temporary
Vite cache. Actual rental detail/guided-editor components, scope rules and save
services run. Auth context, listing read adapters, photo signing, portal responses
and website connections are fixtures. PostgreSQL membership policies are fixture
policies, not a complete reproduction of hosted policies. The fixture starts with
an existing rental; real upload and new-listing browser creation are not certified.

## Repeat locally

From `the-it-guy/`:

```sh
npm run test:rental-listing-distribution-review
node scripts/rental-listing-browser-fixture.mjs
```

Open the emitted loopback URL using a separate Playwright CLI session. Intercept
`https://rental-photo.example.test/**` with synthetic SVG bytes before navigating;
this prevents placeholder images from making external requests. Keep fixture
publishing disabled. Exercise Marketing photo controls, date-only expiry, the
guided editor, both organisation choices and the pending-request settings dialog.
`POST /fixture/checks` returns the isolated listing and activity for assertions.
`POST /fixture/lose-readback` arms a failure for the next read **after an RPC
commit**, allowing recovery to be verified through reload. The fixture's
reconciliation button clears only its in-memory provider result and records a
local activity; server reconciliation is tested separately against mocked portals.
Stop the fixture with SIGINT/SIGTERM to close PostgreSQL and remove its cache.

## Release and actual account acceptance still required

Apply these new migrations, in order, before the matching client/server release:

1. `20261004151831_rental_photo_storage_identity.sql`
2. `20261004154901_rental_listing_durable_history.sql`
3. `20261004155515_rental_publication_attempt_recovery.sql`
4. `20261004163134_rental_listing_expiry_isolated_save.sql`

Do not include unrelated migrations from this active checkout. Follow the existing
[database release runbook](database-release-runbook.md), including the target guard,
recovery evidence, exact dry-run scope and post-release verification. A new release
requires explicit approval under repository instructions; implementing phase 6
has not applied these migrations or promoted a deployment.

After an authorised release, verify the actual complainant's active memberships
and signed-in switch between both organisations. Check principal, branch and
assigned-agent accounts against actual hosted RLS. Using explicitly approved
synthetic records, create a rental with photos, recover a refresh/retry, reopen and
edit it, remove/reorder/change cover, save video/tour and P24 expiry, and inspect
history and website-sharing permissions. Verify private Storage signed URLs and
portal readiness using the real configured agency/agent mappings. Portal publish,
update, withdrawal and reconciliation need a separately approved controlled send;
ambiguous existing content updates still require provider review when the API
cannot prove the outcome. Actual provider credentials, public pages and the
complainant's customer records have not been certified by local fixtures.
