# Public Websites Pilot Closeout — Phase 4 Production Dark Launch

**Status:** implemented

## Outcome

Phase 4 creates a production-backed Kingstons preview without connecting or changing a Kingstons domain. The exact `vercel.app` deployment, source commit, reviewed staging content fingerprint and one production-ready CRM listing are bound in the database before the production site is seeded.

This is not public activation. The Phase 8 custom-domain release remains a separate gate and still requires signed Phase 7 acceptance, DNS/TLS evidence and final approval.

## Safety boundary

- Production is pinned to Supabase project `isdowlnollckzvltkasn`.
- Staging input is pinned to `vaszuxjeoajeuhlcnzzf`.
- The deployment must use `vercel --prod --skip-domain`; no production alias or client hostname is assigned.
- Only a `.vercel.app` hostname can be opened by the dark-launch gate.
- Production assets are copied into production-owned, immutable storage paths.
- The CRM listing must already have a `Published` production projection.
- Pause and rollback disable the preview domain before returning.
- No nameserver, A/AAAA/CNAME, MX, SPF, DKIM or DMARC operation exists in the Phase 4 workflow.
- Public custom-domain activation remains controlled by `website_production_releases`, not the dark-launch table.

## Operator sequence

1. Confirm a current production backup and inspect the website migration ledger.
2. Apply the public-website migration chain and the Phase 4 dark-launch migration through the controlled production migration path.
3. Create or link the dedicated production website project.
4. Configure only production Supabase values, `WEBSITES_RUNTIME_ENV=production`, `ARCH9_APP_URL`, and a unique lead-fingerprint secret.
5. Produce a baseline and candidate deployment with `--prod --skip-domain`. Keep deployment protection enabled.
6. Fill the Phase 4 manifest with the exact Kingstons organisation, production listing, commit, staging content fingerprint and both deployment URLs.
7. Run `prepare`, then `seed`, then `activate --submit-smoke-lead --require-active`.
8. Verify all routes through Vercel protection, the production-owned logos/media and the routed CRM lead.
9. Exercise `pause`, `resume` and `rollback`, then resume the same bound candidate if the final desired state is an active private preview.
10. Retain the read-only evidence JSON and immutable database events.

## Commands

```bash
node the-it-guy/scripts/public-websites-pilot-closeout-phase4-dark-launch.mjs \
  --prepare \
  --manifest /secure/phase4.json \
  --production-env the-it-guy/.env.production.local \
  --operator "release:<name>" \
  --confirm AUTHORIZE_KINGSTONS_PRODUCTION_DARK_LAUNCH_NO_DNS

node the-it-guy/scripts/public-websites-pilot-closeout-phase4-dark-launch.mjs \
  --seed \
  --manifest /secure/phase4.json \
  --staging-env the-it-guy/.env.staging.local \
  --production-env the-it-guy/.env.production.local \
  --operator "release:<name>" \
  --confirm AUTHORIZE_KINGSTONS_PRODUCTION_DARK_LAUNCH_NO_DNS
```

Use the protected GitHub workflow for routine execution. It never promotes a deployment or attaches a domain.

## Exit gate

Phase 4 passes when the evidence reports `ACTIVE` and proves:

- the exact source commit and `.vercel.app` hostname;
- the reviewed four-page Kingstons revision and its separately computed production fingerprint;
- production-owned light/dark logos;
- at least one production CRM listing with production-owned durable media;
- all standard public routes through deployment protection;
- one routed internal CRM enquiry; and
- immutable pause and rollback events.

No Kingstons DNS change is part of this exit gate.
