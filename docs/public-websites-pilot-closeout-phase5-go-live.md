# Public Websites Pilot Closeout — Phase 5 Go-live

**Status:** implemented; Kingstons domain link and DNS cutover intentionally not performed

## Outcome

Phase 5 converts the proven Kingstons production dark launch into a controlled client-domain release. It does not infer client approval and it cannot silently attach a hostname, change DNS, or touch email records.

The release remains on the protected Vercel production preview until a completed approval document is supplied and an operator deliberately runs the later domain steps.

## Delivered

- A service-only database transition from the exact active dark launch to an approved go-live release.
- Approval bound to the Kingstons organisation, exact commit, candidate deployment, rollback deployment, Phase 4 evidence fingerprint, published site and production content fingerprint.
- Mandatory named client approver, approver role, approval reference and recent timestamp.
- A DNS baseline command that records website, nameserver, MX, SPF, DKIM/DMARC-adjacent TXT data without making changes.
- A fail-closed preflight report for approval, domain-link, DNS, TLS, redirects, robots, sitemap, analytics and CRM lead readiness.
- Vercel Web Analytics in the public website runtime.
- Existing Phase 8 prepare, verify, activate and rollback controls remain the only mutation path after approval.

## Kingstons boundary

The intended hostname is `www.kingstons.co.za`. At Phase 5 implementation time it is an active CloudFront website. The apex redirects to `www`; Microsoft 365 MX, SPF, DMARC and the existing nameservers are part of the rollback baseline.

The domain is deliberately not added to Vercel and no DNS record is changed by the Phase 5 preflight.

## Commands

Capture a read-only baseline and readiness report:

```bash
node the-it-guy/scripts/public-websites-pilot-closeout-phase5-go-live.mjs \
  --preflight \
  --organisation-id ec19d0a6-bcba-4eef-aa72-9972de88204d \
  --hostname www.kingstons.co.za \
  --output outputs/public-websites-phase5/kingstons-pre-link-readiness.json
```

After Kingstons gives final approval, copy the example approval, fill it from the client record, and run `--approve` with the exact confirmation phrase printed by `--help`. Domain preparation, verification and activation must then use the controlled Phase 8 release workflow.

## Exit gate

Phase 5 is complete only when the custom domain is active, HTTPS and redirects pass, `robots.txt` and `sitemap.xml` reference the client hostname, analytics is present, a post-activation enquiry is routed to the CRM, and the captured MX/SPF/DMARC/nameserver baseline remains unchanged.

Until the user explicitly authorises domain linking, the correct state is `BLOCKED_PRE_LINK`, not `ACTIVE`.
