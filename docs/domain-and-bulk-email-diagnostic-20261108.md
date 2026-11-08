# Domain connection and bulk email diagnostic

8 November 2026 · Primary Arch9 app, shared Supabase endpoints and existing public website domains.

## Follow-up after the production reconciliation — 8 November, 16:30 UTC

This section supersedes the pre-release status below for **bulk email**. The earlier website-domain findings and missing-routine findings are historical; do not treat them as a fresh production audit. The preceding release applied the prepared reliability migrations/functions. This follow-up checked the updated primary app and shared email backend. Its new fixes are isolated on `codex/email-marketing-diagnostic-20261108`, based on `963beff01957e338f4cf330f495105fd29247153`; remote main was still that revision when checked. These follow-up fixes have **not** been deployed, and no live email, DNS change or provider mutation was made.

### Confirmed live blockers

Read-only evidence from Arch9 SaaS (`isdowlnollckzvltkasn`):

- The shared campaign account is disabled, with daily and monthly limits both zero. Organisation limits cannot override this account stop.
- `homeseekers.co.za` and its custom sender are marked failed. The latest stored provider check is 22 October. Current public DNS still differs from those cached requirements: the DKIM key differs, `send` points at Forge, its SPF/MX identify Forge, and `rsend` points at `rsend-euw1.forge.rmta.net`. This confirms a mismatch with cached requirements, not which provider should own these names. Current Resend records must be fetched before proposing exact DNS edits. An existing DMARC monitoring record is present.
- There are 19 draft campaigns, no dispatch jobs and no durable test receipts. There is no delivery history here that establishes bulk sending works live.
- All five previously missing reliability routines now exist. The worker cron is active every five minutes. The inspected 24-hour window had 287 successful and one failed scheduler run; 287 actual worker HTTP requests returned 200. Successful empty polling is not email delivery.
- Provider credentials/webhook/billing readiness could not be independently certified: no Resend connector or local provider credentials were available. The primary Vercel environment contains no matching Resend/campaign configuration; the sending functions run on Supabase, whose secret values were not retrieved. Do not interpret this as proof that Supabase secrets are missing.

### Bugs fixed in this isolated follow-up

1. Content checks discarded specific server failures and incorrectly blamed administrator activation. The UI now retains actionable DNS, permissions and provider messages. Preflight lists each failed sender/category/policy/audience/account check, rejects malformed responses and never treats contradictory checks as ready.
2. Imported HTML previews omitted the footer that actual delivery adds. Preview now uses the delivery renderer, shows sender details and the personal-unsubscribe explanation, personalises the content and retains an empty iframe sandbox. A preview never supplies a real unsubscribe token.
3. A saved sender could appear ready while its linked domain was pending. Review and tests now require current local sender/domain readiness while permitting draft editing and saving. A blocked Review explains the domain issue.
4. Provider DNS verification alone was accepted even when sending capability was disabled. Custom-domain refresh, the Arch9 sender refresh and executive readiness now reject that state. Existing responses without a capabilities field remain compatible.
5. Recovery after a lost domain-create response could trust a stale domain-list status when the detail request failed. It now retains the provider ID as pending and clearly requires re-verification; mismatched IDs/names cannot become ready. Existing-domain calls have a timeout.
6. Definitive provider test rejections appeared as uncertain delivery, hiding the real reason. Definitive 4xx responses now display the redacted rejection, persist a rejected receipt and explicitly report that delivery is not uncertain. Ambiguous responses/timeouts remain protected against duplicate sends. A sending-control storage outage reports unavailability rather than falsely claiming quota exhaustion.
7. Regex tracking missed unquoted/encoded links and could alter Outlook HTML. Tracking now uses the existing HTML parser, decodes destinations correctly and replaces only the href attribute. Final personalised content is checked before tracking can mask a bad URL. Tokens are reused within each campaign batch, reducing repeated database writes while keeping recipient capabilities separate. Optional tracking-storage failures retain valid original destinations.
8. Campaign reports did not show why dispatch was waiting. A new authenticated, tenant-scoped read-only RPC returns a small delivery-status summary without exposing queue leases, provider payloads or account quotas. Reports show pause/capacity/failure reasons, retain recipient evidence if status is unavailable, and refresh once per action.

Owning product: the primary app (`the-it-guy/`) and shared email Supabase layer. Public websites, admin, Inbox, WhatsApp, transactional mail and unrelated bond edits are outside this follow-up.

### Verification of the follow-up

| Check | Result |
| --- | --- |
| Final six focused Vitest files | 217 tests passed |
| Full service-to-database-to-worker journey included above | Passed: HTML/image import, save, consent preflight, schedule, both sender modes, mocked provider acceptance, callbacks, clicks, reports, unsubscribe and cross-organisation denial |
| Domain helpers/create recovery, sender verification, executive readiness and signed webhook checks | 39 Deno tests passed, each file in a separate process |
| New delivery-status PostgreSQL routine | 14 checks passed, including anonymous/cross-tenant denial and restricted output |
| Existing organisation isolation, sender options and test-receipt database checks rerun with new migration | All three scripts passed |
| Existing email database/contracts baseline | All 14 scripts passed |
| Seven affected deployed endpoint entry points | Deno check passed |
| Scoped ESLint | Zero errors; six existing component warnings |
| Browser through real components/services with isolated synthetic provider/storage responses | HTML upload/save/preview, saved audience, pending-domain block, explicit failed preflight, definitive test rejection, queue reason and refresh passed |
| Browser delivery report at 390px | Document and report width 390px; waiting reason visible |
| Whitespace/conflict checks | Passed |

The broader initial marketing selection exposed two existing WhatsApp sync wording failures (783 other tests passed). Those failures are unrelated to email and were not hidden or repaired as part of this task. Initial new-test selector failures were corrected; final email checks pass. Deno endpoint tests replace global environment/fetch, so they were verified in separate processes to avoid mock interference.

Provider writes were mocked and database writes used local PGlite. Browser fixtures use synthetic storage/account responses; the separate integration journey exercises actual SQL and handlers. No authenticated live send, inbox authentication-header inspection or cross-client rendering certification occurred. A full local production build was not attempted because this limited-memory machine previously exhausted its 1536 MB heap; an isolated cloud build remains necessary before promotion.

Evidence is in `output/email-marketing-diagnostic-20261108/`, with browser snapshots and screenshots in `output/playwright/email-marketing-20261108/`. The reproducible local fixture is `the-it-guy/scripts/email-marketing-browser-fixture.mjs` (loopback only, no credentials).

### Exact release and activation decisions

The isolated code release contains **one append-only migration**, `20261108160845_email_campaign_delivery_diagnostics.sql`, the primary app, and these seven endpoint bundles: `email-sending-domain-create`, `email-sending-domain-verify`, `email-sender-verification`, `email-platform-status`, `email-campaign-test`, `email-campaign-worker`, `resend-webhook`. Shared imports require redeploying unchanged entry points as listed. No public-site or admin deployment is needed.

Before any approved production database change, follow `docs/database-release-runbook.md`: confirm project identity, run the guard and recovery checks, inspect the exact pending dry-run scope, and stop on unexpected migrations. Apply the reviewed migration before the app; deploy all seven bundles from the same commit; build the primary app in the cloud, inspect the build result, and verify authenticated status, permissions and queue explanations before promotion. Keep account sending disabled during deployment. Recovery: redeploy the prior app/function revision; this additive read-only RPC may remain in place. No receipt deletion or queue replay is a rollback procedure.

Separate approvals needed to activate sending:

1. Approve deploying this isolated code/schema release to Arch9 SaaS and the primary app. This task requested diagnostics/fixes, so the preceding task's production approval does not cover this new release.
2. Confirm the intended sending domain and provider arrangement. Fetch the **current** provider records, then approve exact DNS changes or a dedicated sending subdomain; preserve existing inbox/provider records. No record replacement is pre-approved here.
3. Approve the account daily/monthly recipient budgets, provider costs and enabling the account. No budget numbers have been invented. If the shared Arch9 sender is desired, verify its dedicated domain and `ARCH9_CAMPAIGN_RESEND_DOMAIN_ID`, enable `ARCH9_CAMPAIGN_SENDING_ENABLED`, verify provider/webhook credentials and required delivery/domain events, and confirm billing through `RESEND_BILLING_CONFIRMED`. Custom senders still require the shared account budget.
4. Name an approved test recipient and consented small pilot audience. Send a real test, inspect SPF/DKIM/DMARC alignment and Reply-To, confirm delivered callbacks, then run the pilot through scheduling, unsubscribe and suppression before broader sending. Provider acceptance alone is not delivery or inbox placement.

These remote steps require current-task approval under `AGENTS.md`: “Never run a command that applies migrations, writes remote data, sends email, publishes listings, or promotes a deployment without the user's explicit approval in the current task.” The code fixes and reviewable release scope are complete; live activation remains blocked by the configuration and acceptance work above.

Provider references checked: [Resend domain status and sending capabilities](https://resend.com/docs/api-reference/domains/get-domain), [email idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Gmail authentication and unsubscribe requirements](https://support.google.com/a/answer/81126).

## Historical diagnostic before the preceding production release

The remainder preserves the earlier review as evidence; its deployment and missing-routine statements describe that earlier point in time.

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
