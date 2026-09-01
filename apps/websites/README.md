# PropData Websites

The public, server-rendered multi-tenant website application. It is intentionally separate from the existing iSite Vite application.

## Local preview

```bash
npm install
cp .env.example .env.local
npm run dev
```

With `WEBSITES_DEMO_MODE=true`, open `http://localhost:3000` to review the neutral property template without needing a database site record.

## Production configuration

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the server environment. The service-role key must never be prefixed with `NEXT_PUBLIC_` or sent to the browser.

Create a separate Vercel project rooted at `apps/websites`. Add preview and client domains to this project only after the Phase 1 migration is deployed and hostname resolution has been tested.

The domain connection process must never change client nameservers, MX, SPF, DKIM or DMARC records.

## Launch guardrails

- Preview domains are deliberately blocked from search indexing through `robots.txt`.
- A custom domain becomes indexable only after it is an active domain for a published site.
- `sitemap.xml` is generated per resolved custom domain and contains only approved public pages and published property paths.
- Use the Phase 4 runbook before activating a custom domain. It requires only website A/ALIAS/CNAME and verification TXT records; it explicitly prohibits email and nameserver changes.
