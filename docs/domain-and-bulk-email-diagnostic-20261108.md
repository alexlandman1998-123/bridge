# Domain connection and bulk email diagnostic

8 November 2026 · Primary Arch9 app, shared Supabase endpoints and existing public website domains.

## Outcome

Local fixes and focused automated checks pass. **Production is not ready for a full bulk-email acceptance test.** No application or Edge deployment, database push, DNS edit, domain activation/removal or email send was performed.

This review covers both website-domain connection (Vercel) and email sending-domain connection (Resend). They are separate workflows. Website-domain connection must preserve email DNS and nameservers. The existing transactional email channel was not changed.

## Priority findings

1. **Production website-domain authorization gap.** The endpoint checked whether the caller could read a website, then used service authority for domain actions. Production has an active-member read policy as well as an administrator policy; read access therefore does not establish management permission. The deployed endpoint bundle lacks an explicit `bridge_is_org_admin` check. The local fix now requires administrator permission before any provider operation or domain mutation. Tests deny connect, verify, promote and remove for a non-admin without provider calls or writes.
2. **Website ownership was mistaken for DNS readiness.** Provider ownership verification alone does not confirm correct traffic routing. The local fix fetches project-scoped Vercel domain configuration, requires `misconfigured === false` as well as ownership proof, and rechecks both before primary activation. An active domain is preserved during a status refresh rather than accidentally demoted. This is a DNS/routing readiness check, not an actual certificate issuance or browser acceptance test.
3. **DNS instructions were invisible.** The website screen mentioned records without showing their values. It now displays exact provider ownership TXT and preferred A/CNAME recommendations, with apex A and subdomain CNAME choices kept separate. No universal Vercel address is hardcoded; email DNS and nameservers remain untouched.
4. **Interrupted website setup could not recover safely.** Domain registration previously happened before a local hostname reservation, and conflict upserts could affect another site's hostname under concurrency. Setup now reserves the hostname first and uses site-scoped updates. Retries inspect an existing project domain before registering again. Active/primary domains are rejected before any deletion call; a provider-side 404 does not prevent removal of an otherwise eligible inactive local record.
5. **Email domain retries could strand setup.** If Resend created a domain but the response or database save was lost, the next attempt tried creation again. Setup now looks for the matching domain using provider pagination and reconnects it. Provider outages no longer report cached success. Existing-domain checks refresh current verification state, network calls are bounded, and stored provider errors redact the active provider token.
6. **Campaign data could survive a workspace change.** Email overview requests lacked scope/generation checks. A late previous-agency response could replace the current list, or a failed next load could leave old rows visible. Overview data is now keyed to organisation, user and membership; old requests are discarded and private rows cleared on failure. The detailed report remounts when that access scope changes. Existing email editor and website domain-manager scopes remain isolated.
7. **The live email backend lacks prepared reliability routines.** Read-only checks found none of `email_campaign_claim_dispatch_jobs`, `email_campaign_reconcile_provider_receipts`, `email_campaign_test_claim`, `email_campaign_acquire_send_slot` or `email_campaign_apply_platform_status`, and no `email_campaign_test_receipts` table. The local worker/test implementation depends on these. Its passing local checks must not be described as production functionality. Matching database and function release work remains necessary.

## Read-only production evidence

Project: Arch9 SaaS (`isdowlnollckzvltkasn`). Staging was not changed.

- Email: one sending domain (`homeseekers.co.za`) and its sender are marked failed. The cached provider error reports DNS failure; the last stored check was 22 October 2026. All 18 campaigns are drafts; there are no dispatch jobs in the inspected data. No successful bulk campaign can be certified from this production history.
- Public DNS inspection found that `resend._domainkey.homeseekers.co.za` publishes a different key from the cached expected Resend key. The `send` hostname resolves through `send.forge.rmta.net`, and `rsend` points to `rsend-euw1.forge.rmta.net`; these differ from the cached SPF/MX/CNAME requirements. `_dmarc` exists with a monitoring policy. This is evidence of a configuration mismatch, not proof of which provider should own those selectors. The provider's current requirements must be confirmed before changing anything. In particular, do not overwrite another mail provider's DKIM or replace root MX/SPF records as a shortcut; a separate sending subdomain may be appropriate after the owner chooses it.
- Websites: 14 domain rows are active and one is disabled; four active rows are custom domains, the remainder previews. The deployed domain-management endpoint lacks the administrator and routing checks described above.
- HTTPS HEAD requests followed redirects and returned 200 for `homeseeker.co.za`, `www.homeseeker.co.za`, `kingdomrealestate.co.za`, and `www.kingdomrealestate.co.za`. Both singular HomeSeeker hostnames currently redirect to `https://www.homeseekers.co.za/`. The Kingdom hosts return 200 at their respective hostnames. This verifies reachability and TLS negotiation from this machine, not the correctness of the destination content or tenant identity.
- The `arch9-email-campaign-worker` schedule is active every five minutes. The inspected 24-hour window had 284 scheduler successes and four connection failures, followed by successful runs. Scheduler success is not evidence of delivered email.
- The inspected domain, sender, campaign, recipient and suppression tables have RLS enabled. Tenant access, consent, quota, pause and receipt behavior were exercised locally; this is not a claim that every production policy was audited.

## Sending behavior reviewed

The existing prepared implementation retains consent/subscription/suppression filtering, sender/domain verification, final content/source checks, sending controls and quotas, scheduled background jobs, visible unsubscribe links and one-click unsubscribe headers, signed provider callbacks, bounce/complaint suppression and separate accepted/delivered/opened/clicked results.

Local database checks cover concurrent claims, expired lease recovery, exact original payload/key reuse, cancellation, late and early receipts, out-of-order events, safe handling of uncertain sends, atomic suppressions, storage rollback, organisation isolation and durable test-send intents. Provider email idempotency lasts 24 hours; the prepared database recovery stops unsafe older uncertain requests rather than blindly replaying them.

This does not guarantee inbox placement, absence of provider rejections, or permission to email a particular audience. Domain authentication and correct content do not replace recipient permission.

References checked: [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction), [domain verification](https://resend.com/docs/api-reference/domains/verify-domain), [domain pagination](https://resend.com/docs/api-reference/domains/list-domains), [email idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Vercel domain ownership](https://vercel.com/docs/rest-api/projects/verify-project-domain), [Vercel DNS configuration](https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration), and [Gmail sender requirements](https://support.google.com/a/answer/81126).

## Validation

| Focused check | Result |
| --- | --- |
| Email phase 0–7 contracts, delivery recovery, organisation isolation, sender options and durable test receipts | 31 passed test results, including nested database cases |
| Campaign overview/settings/editor, delivery and test reliability, website DNS rendering | 213 passed tests across six files |
| Domain HTTP handlers, provider-domain recovery, sender/platform verification and signed delivery/suppression webhooks | 40 passed tests |
| Affected website and email domain entry-point Deno checks | Passed |
| Scoped ESLint | No errors; existing component warnings remain |
| Scoped diff whitespace checks | Passed |
| Four existing public custom-host HTTPS checks | HTTP 200 after redirects; destinations recorded above |

**284 distinct passing automated test results.** The final overview/DNS checks were repeated after the request-cleanup adjustment and passed. Provider writes/sends were mocked; database writes were to local PGlite only. Some phase checks are source contracts rather than behavioral tests. Two stale checks were updated for the current Upload HTML wording and extracted audience component. Editor fixtures now test the current saved shared-audience selection instead of the retired direct CRM recipient picker.

No full production build or authenticated browser/provider acceptance flow was run. Verification used focused checks and one Vitest worker to respect the machine's memory constraints.

## Remaining release and acceptance work

- Prioritise the reviewed website-domain permission fix. It still needs deployment approval and post-deploy verification; no exploit or unauthorized production mutation was attempted.
- Prepare an isolated email release with the exact schema/function dependencies and recovery evidence. Existing prepared migrations include delivery reliability, sender options, organisation isolation and test receipts from 5 November. This is not yet a certified push scope; use the repository release runbook and guard before any approved push.
- Confirm the intended email domain/provider arrangement and obtain explicit approval for any DNS change. Fetch current provider DNS requirements rather than blindly applying the older cached records. Preserve the current provider's email configuration.
- Verify domain ownership/routing and sender status through the authenticated UI after the approved release. For a new website connection, use a deliberately approved test hostname; existing live domain removal is not a smoke test.
- With an explicitly approved recipient and recorded permission, send a test, inspect real authentication headers, confirm delivery and reply-to behavior, then run a small approved campaign and confirm worker completion. Exercise unsubscribe, suppression and scheduling only within that test scope. Distinguish provider acceptance from recipient delivery and inbox placement.

`AGENTS.md` requires explicit approval for deployment, database changes, DNS/provider changes and live messages. These operational steps remain outstanding; this report does not claim the requested live end-to-end outcome is complete.
