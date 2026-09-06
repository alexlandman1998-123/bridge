# Public Websites — Phase 8 Controlled Production Release

**Status:** implemented locally; production remains blocked by the Phase 7 exit gate

**Implemented:** 5 September 2026

## Outcome

Phase 8 provides the final, reversible release path for the first `property-standard-v1` agency website. Production serving is a separate permission from the staging pilot: a Phase 7 enrolment cannot make a client hostname live.

A production release is bound to one organisation, a verified Phase 7 evidence fingerprint, one source commit, one reviewed Vercel candidate, one known rollback deployment, one published website revision fingerprint and one client-approved hostname. The public application fails closed unless the runtime is explicitly configured as production and that exact hostname has an active release.

## Delivered controls

- Service-only production approval, domain preparation, verification, activation and rollback commands.
- RLS-protected production release records and immutable release events.
- A pinned production Supabase project check and an exact confirmation phrase for every mutation.
- Phase 7 evidence integrity verification and commit matching.
- Website-only DNS snapshots that require email DNS and nameservers to remain unchanged.
- A domain gate that rejects preview, mail, autodiscover, SMTP, IMAP and POP hostnames.
- Production activation bound to the approved deployment and unchanged published-content fingerprint.
- An explicit runtime environment gate in the public website application.
- Protected GitHub production environment workflow with Vercel inspection, promotion, CRM lead smoke, evidence retention and automatic fail-closed rollback.
- An emergency rollback path that closes public/lead access before rolling Vercel back and flags the recorded website DNS snapshot for restoration.

## Why production is not live yet

Phase 7 has not produced a genuine `PASS` evidence artifact, no pilot agency has been selected, the production website schema has not been migrated and `apps/websites` is not linked to its Vercel project. Phase 8 deliberately cannot bypass those facts.

No production database, deployment, domain or DNS record was changed while implementing this phase.

## Required production configuration

The Vercel Production environment must contain only production values:

```text
WEBSITES_RUNTIME_ENV=production
SUPABASE_URL=https://isdowlnollckzvltkasn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only production key>
WEBSITES_LEAD_FINGERPRINT_SECRET=<production secret>
ARCH9_APP_URL=https://app.arch9.co.za
```

The protected GitHub environment `public-websites-production` requires reviewer approval and these secrets:

```text
SUPABASE_PRODUCTION_PROJECT_REF
SUPABASE_PRODUCTION_URL
SUPABASE_PRODUCTION_SERVICE_ROLE_KEY
VERCEL_WEBSITES_ORG_ID
VERCEL_WEBSITES_PROJECT_ID
VERCEL_TOKEN
WEBSITE_RELEASE_SMOKE_EMAIL
```

## Controlled sequence

1. Complete Phase 7 and retain its read-only `PASS` JSON. Its evidence fingerprint and manual acceptance source commit must verify.
2. Apply the reviewed website migration chain, ending with `20260905190023_public_websites_phase8_controlled_production_release.sql`, through the controlled production migration pipeline. Run pgTAP, database lint and advisors before proceeding.
3. Build and inspect a preview deployment from the exact approved commit. Record the current known-good production deployment as the rollback target.
4. Complete `public-websites-phase8-production-approval.example.json`. The accountable approver must supply the exact confirmation phrase.
5. Run the workflow with `action=plan`. It is read-only and rejects mismatched or modified Phase 7 evidence.
6. Run `action=approve` to create the server-side production release permission. This permits Website Studio configuration but does not serve the custom domain.
7. Capture the existing website records and planned website-only changes in the DNS snapshot. Run `action=prepare-domain` to record them and add the approved hostname to the Vercel website project.
8. Make only the approved A, AAAA, ALIAS, ANAME, CNAME or verification TXT changes. Never modify nameservers, MX, SPF, DKIM, DMARC, mail or autodiscover records.
9. After DNS and TLS resolve correctly, complete the verification evidence and run `action=verify-domain`.
10. Run `action=activate`. The workflow inspects the candidate and rollback deployments, promotes the approved candidate, opens the exact database serving gate, checks every standard public route and submits one controlled CRM enquiry.
11. Retain the immutable Phase 8 evidence artifact and observe public errors, CRM routing and notification delivery during the release window.

## Emergency rollback

Run `action=rollback` with a clear incident reason. The workflow:

1. reads the rollback deployment stored in the database rather than accepting a new target;
2. pauses the production release and disables the custom domain in the public read model;
3. restores the preview domain as the database primary;
4. rolls Vercel back to the stored deployment; and
5. records an immutable `rolled_back` event.

Support must then restore only the website records captured in the DNS snapshot when the prior website was hosted elsewhere. Email records and nameservers remain untouched.

## Completion position

The source implementation for Phases 0–8 is complete when all contract tests and builds pass. The product is operationally production-ready only after Phase 7 reports `PASS`, the production migration/advisor checks pass, the protected Phase 8 workflow activates the chosen agency successfully and the resulting evidence reports `ACTIVE` with a routed post-release CRM lead.
