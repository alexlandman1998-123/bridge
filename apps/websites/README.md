# Arch9 Websites

The public, server-rendered multi-tenant website application. It is intentionally separate from the existing iSite Vite application.

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
