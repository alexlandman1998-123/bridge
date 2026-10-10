# Arch9 Websites

The public, server-rendered multi-tenant website application. It is intentionally separate from the existing iSite Vite application.

## Home Seekers and Kingdom release boundary

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

Owned and partner snapshots include the sale status after applying
`20261010214831_website_listing_sale_status.sql` and updating the listing channel.
Cards and detail pages display Sold or Under offer from that accepted snapshot.
Legacy snapshots retain For sale until updated; rentals retain To let. This does
not publish, withdraw or rewrite existing adverts. The primary app owns the
all-channel sale-status action and per-channel removal controls.
