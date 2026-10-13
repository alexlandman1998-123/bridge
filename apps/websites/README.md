# Arch9 Websites

The public, server-rendered multi-tenant website application. It is intentionally separate from the existing iSite Vite application.

## Home Seekers and Kingdom release boundary

Production verification on 13 October 2026 confirmed that Kingdom’s public domains
currently belong to `arch9-websites-staging`, serving its **production** deployment.
Their website source already matches this checkout. The separate
`arch9-websites-production` project also received the same source. Check the actual
public domain owner before a future release; project names alone do not identify
the customer-facing deployment. This release preserved the existing routing.

Home Seekers' customer site is implemented in the primary Vite app under `the-it-guy/src/pages/HomeSeekers*` and has its own `home-seekers-website` Vercel project. Kingdom's Arch9 site is rendered here and is released through the separate `arch9-websites-production` project. A Home Seekers website release does not include this app; a Kingdom website release does not deploy the Vite app.

Kingdom renders with the `kingdom-v1` template and its visual rules live in `app/kingdom.css` and `app/kingdom.module.css`. Its existing database row still contains the legacy `home-seekers-v1` key because the repository's Phase 0 migration freeze blocks new migrations. The renderer identifies Kingdom by its immutable site and organisation IDs; this changes presentation only, never listing or lead scope. Shared listing, lead, and publication code remains tenant-scoped. Before a Kingdom release, check its project target and the Kingdom preview hostname; before a Home Seekers release, check the `home-seekers-website` target and `/demo/homeseekers`. Do not bundle the two project deployments into one site release.

## Local preview

```bash
npm install
cp .env.example .env.local
npm run dev
```

With `WEBSITES_DEMO_MODE=true`, open `http://localhost:3000` to review the neutral property template without needing a database site record.

## Production configuration

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBSITES_LEAD_FINGERPRINT_SECRET` and `ARCH9_APP_URL` only in the server environment. The service-role key and fingerprint secret must never be prefixed with `NEXT_PUBLIC_` or sent to the browser. Enquiry ingestion fails closed if the fingerprint secret is missing.

Set `WEBSITES_RUNTIME_ENV=staging` for the Phase 7 preview project and `WEBSITES_RUNTIME_ENV=production` only in the Vercel Production environment. A missing or unknown value fails hostname resolution closed.

Create a separate Vercel project rooted at `apps/websites`. Add preview and client domains to this project only after the Phase 1 migration is deployed and hostname resolution has been tested.

For Phase 7, use a dedicated staging project with no client domains. Public resolution and lead ingestion are fail-closed unless the organisation is the single active entry in `website_pilot_enrolments`. Follow `docs/public-websites-phase7-staging-pilot.md` before running the protected staging deployment workflow.

The domain connection process must never change client nameservers, MX, SPF, DKIM or DMARC records.

Production promotion and rollback follow `docs/public-websites-phase8-controlled-production-release.md`. A staging pilot enrolment is never sufficient to serve a client-owned hostname.

## Launch guardrails

- Preview domains are deliberately blocked from search indexing through `robots.txt`.
- A custom domain becomes indexable only after it is an active domain for a published site.
- `sitemap.xml` is generated per resolved custom domain and contains only approved public pages and published property paths.
- Use the Phase 4 runbook before activating a custom domain. It requires only website A/ALIAS/CNAME and verification TXT records; it explicitly prohibits email and nameserver changes.

## Listing price terms

Published website snapshots carry `rental_price_frequency` (monthly, weekly,
daily, annual or per_square_metre). Cards, the featured carousel and detail pages
show that unit without converting the amount. Legacy snapshots without a cadence
retain the previous monthly convention; update their website channel to capture
current terms. Explicit sale POA suppresses the public numeric price, including
when a numeric amount was supplied for another portal. The forward migration
`20261010111500_website_listing_public_price_terms.sql` applies this to both own
and partner website publication, retaining membership, grant and media checks.


## Listing sale status

Kingdom sale property detail pages include a “Can I afford this property?”
calculator below similar homes. It starts with the public asking price (or an
empty price for POA), compares the bond repayment against the visitor's income,
expenses, debt and savings buffer, and links to preapproval. The price-panel
link jumps to the inline calculator. Rental pages and other templates retain
their existing experience. Inputs stay in browser memory; estimates are not
bank approval. Verification: finance unit tests, `npm run check:website`, and
desktop/mobile browser checks against local demo listings.

Owned and partner snapshots include the sale status after applying
`20261010214831_website_listing_sale_status.sql` and updating the listing channel.
Cards and detail pages display Sold or Under offer from that accepted snapshot.
Legacy snapshots retain For sale until updated; rentals retain To let. This does
not publish, withdraw or rewrite existing adverts. The primary app owns the
all-channel sale-status action and per-channel removal controls.

## Partner listing statistics correction (12 October 2026, prepared)

Published partner property pages now render the same listing-view tracker as
native pages. The database correction
`20261012110258_listing_website_partner_statistics.sql` permits tracking only
for published partner channels with an enabled, correctly scoped grant. It also
includes approved partner publication sites and enquiry receipts in the owning
listing's statistics. Existing hostname, event and owner/member checks remain
in force; the migration preserves installed RPC grants and recruitment events.

Apply the database correction before releasing this website tracker change.
The primary app additionally displays today's recorded website views separately
from its completed-day report. These changes require separate website and app
releases; none has been deployed for this correction. Unrecorded historical
partner visits are not reconstructed.

The read-only active-listing audit found I Sell's A9-ISELLPROPERT-000008 published
as a partner on Kingdom's site, and A9-KING-000243 published natively. Only one
listing-view event existed for the rental, dated 12 October, which the existing
completed-day report excluded. This diagnosis concerns Arch9's first-party
website tracking, not Vercel visitor counts or an external analytics provider.

## Kingdom recently sold

Kingdom's `/recently-sold` page, main menu/footer links and homepage collection
read the current CRM `Sold` status for Kingdom Real Estate and ISellProperty.co.za.
The latter requires Kingdom's existing enabled partner grant. Other tenants,
active/under-offer stock, rentals and demo rows are excluded. No publication or
CRM status is changed by viewing the collection. The collection remains empty
until genuine records are marked Sold; the 12 October read-only audit found none.

Only public property facts are returned. Cards show suburb, property title,
features, agency attribution and **Last asking price**, not a claimed sale price.
There is no recorded sold date in the current schema: display order follows the
latest CRM update, without displaying it as a sale date. Photos reuse copied
public website images, including retained snapshots after an advert is removed.
When no website copy exists, cards use the CRM cover image with a fresh seven-day
viewing link. Only image records inside the sold listing's own `gallery/`
namespace can be signed; documents, other listing paths and foreign URLs are
excluded. No stored file or publication record is changed. A placeholder is used
only when no eligible photo can be read. Sold cards do not link to a withdrawn property's page.

Verification: `node --test lib/kingdom-recently-sold.test.mjs` and root
`npm run check:website`. The connected local browser fixture covers the page,
homepage, simplified sold page and mobile menu with synthetic records, without remote writes.
A separate approved Kingdom website deployment is required to make this live.
