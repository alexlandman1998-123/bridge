# Arch9 Email Campaigns — Phase 5: Campaign operations

Phase 5 provides the controls needed to operate campaigns safely at agency scale.

## Included

- Server-side preflight before a campaign can be queued or scheduled.
- Preflight checks verified sender, active subscription category, organisation sending pause, and current eligible-audience count.
- Immediate or local-time scheduled launch control in the review step.
- Server-authorized duplicate and archive actions.
- Organisation-scoped campaign audit events for preflights, scheduling, cancellation, duplication and archiving.

## Guardrails

Preflight, archive and scheduling require sender-capable authority. Duplicate requires organisation membership but always creates a new draft—never a new send job. Scheduling still performs the existing immutable audience snapshot and all consent/suppression checks after preflight; preflight is a launch decision aid, not a bypass.

The original phase requires its schema and application release before live use.

## Delivery reliability correction — 5 November 2026

Prepared locally for the primary workspace's campaign backend. The six audited
delivery/callback defects are covered by worker, signed webhook and isolated
database regressions. No migration was applied remotely, no Edge Function was
deployed, and no real email was sent.

- Jobs use renewable ownership leases. A job left running for five minutes can
  be reclaimed; an old worker cannot prepare another send or complete the job.
- Each recipient's exact provider request is stored in a server-only outbox
  before sending. Timeouts, throttling and uncertain responses retry that same
  request and idempotency key. Provider calls have a 15-second deadline.
- Resend retains idempotency keys for 24 hours. Arch9 conservatively stops
  automatic retries after 23 hours, and stops legacy uncertain sends that have
  no saved request. These campaigns require manual provider reconciliation;
  operators must not reset them to queued or duplicate them as a retry.
- Required read/write failures cannot become successful completion. Finishing
  or stopping a batch updates its campaign and job in a single transaction.
- Signed campaign receipts are applied before shared webhook-audit deduplication.
  Event history, recipient state and bounce/complaint/provider suppression are
  transactional. Failed writes return an error so Resend can retry them.
- Receipts arriving before provider acceptance is saved are retained. Acceptance
  replays them; the scheduled worker also drains receipts missed by concurrent
  commits, even when it has no queued send jobs.
- Recipient state changes are ordered under the database row lock. A late send
  response or delivery/open callback cannot replace a later engagement or a
  terminal suppression, bounce, complaint or unsubscribe state.

The new tables and RPCs have RLS enabled where applicable and no browser/anon
access; only server service authority can read provider requests or reconcile
receipts. Existing consent, category subscriptions, quotas, sender verification
and listing/show-day freshness checks remain in the sending path. The worker
claims one campaign batch of at most 50 recipients per invocation.

Release order: apply `20261105154612_email_campaign_delivery_reliability.sql`,
deploy `resend-webhook`, then deploy `email-campaign-worker`. Keep the deployed
credential wrappers. Treat both functions as one reviewed release scope; an
older webhook must not process callbacks after the new worker starts retrying.
Do not drop the additive tables or discard saved requests during rollback.
Pause campaign dispatch before rollback and reconcile uncertain outcomes first.
Unmatched non-campaign receipts remain server-only; retention cleanup can be
introduced separately without deleting unprocessed campaign receipts.

Focused checks, run serially from the repository root:

```sh
node --test --test-concurrency=1 scripts/email-campaign-delivery-reliability.test.mjs scripts/email-self-service-database.test.mjs scripts/email-campaign-phase4.test.mjs scripts/email-campaign-phase5.test.mjs
NODE_OPTIONS=--max-old-space-size=1024 node the-it-guy/node_modules/vitest/vitest.mjs run --root the-it-guy src/services/__tests__/emailCampaignDelivery.test.js src/services/__tests__/emailSelfService.test.js src/services/__tests__/emailCampaignSourceFreshness.test.js src/components/marketing/__tests__/emailContent.test.js --maxWorkers=1
deno test --allow-env --allow-read --allow-net=esm.sh,registry.npmjs.org supabase/functions/resend-webhook/index.test.ts supabase/functions/_shared/emailSendingDomain.test.ts
deno check --no-lock --config supabase/functions/email-campaign-worker/deno.json supabase/functions/email-campaign-worker/index.ts
```

Provider retry-window reference: [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Organisation isolation and shared-account controls (pass 3, local implementation)

Owned by the primary marketing app and shared campaign Edge Functions/database.
Migration `20261105164327_email_campaign_organisation_isolation.sql` follows the
local delivery-reliability and sender-options migrations; none of these notes
claim a production release or a real delivery.

- Email records cannot change organisation, and sender/category/contact/campaign/
  recipient/branch references must belong to the same organisation. Restrictive
  membership policies also remove the old campaign creator exception after a
  user leaves an organisation. Existing image ownership/storage rules remain in
  place; template/audience edits now include organisation filters explicitly.
- Hosted opt-outs and category choices commit in one transaction, using only the
  bearer token's organisation/address. Foreign or inactive categories fail before
  any write. Opt-out includes queued and sending recipients. Opt-in clears only
  that organisation's unsubscribe suppression; provider safety blocks survive.
  The pages return an error if storage fails and never cache bearer-link content.
- Managers can pause/resume their own campaigns/tests and lower their own daily
  limit (maximum 500, also bounded by the operator limit). Their RPC cannot change
  operator approval, safety pauses or self-service blocks. New allocations honour
  the lowered limit; existing reservations stay charged. Pause stops subsequent
  send gates, while a request already submitted to the provider cannot be recalled.
- Campaigns and tests share a private, serialized send gate, initially one request
  per second. Resend 429 responses apply a shared bounded Retry-After cooldown.
  The worker fairly rotates organisations and allows one active leased job per
  organisation. Short rate waits are retried locally; longer waits retain queued
  work. Frozen payloads/idempotency keys are preserved. The 23-hour uncertainty
  window begins at the first provider attempt, not while waiting in the queue.
- Global campaign daily/monthly allocation budgets supplement each organisation's
  daily quota. Reservations are bound to organisation, identity and test actor;
  retries do not allocate twice in a day. An older queued reservation must obtain
  the new day's allocation before sending. UTC defines quota periods. Failed or
  abandoned allocations remain conservatively charged.
- Signed, matched bounce/complaint/suppression receipts populate a server-only
  account safety list. A block stops that address across campaign organisations
  with a generic reason and no disclosure of its origin. Tenant-writable local
  suppression metadata cannot create an account-wide block. This conservative
  local block requires operator reconciliation; preference opt-in never removes it.

### Release prerequisites

The new singleton `email_campaign_account_limits` defaults to **disabled** with
zero daily/monthly budgets. This is intentional: configure its `enabled`,
`daily_limit`, `monthly_limit` and `minimum_interval_ms` server-side only after
checking the actual Resend allowance. Leave capacity for transactional email and
other systems using the same account. These budgets and rate slots cover Arch9
campaign and campaign-test POSTs; transactional mail, verification API requests
and other account users do not pass through this gate. One Resend account still
shares provider reputation, billing and provider-enforced limits.

For an explicitly approved release: stop campaign dispatch first, apply the three
local migrations in timestamp order using the database release runbook, release
`email-campaign-worker`, `email-campaign-test`, `email-unsubscribe`,
`email-preference-centre`, `email-campaign-track` and the earlier pass's sender/
webhook functions, then release the primary app. Check current ownership data for
historical mismatches; the new guards reject new writes rather than silently
moving or deleting existing records. Configure the private campaign budget and
verify platform-domain readiness before restarting dispatch. Do not change the
central transactional sender or remove unrelated/obsolete domains as part of
this migration. A controlled live delivery still needs separate authorisation.

Focused local evidence is in `output/email-marketing-audit-20261105/pass3-*.log`.
Run database checks serially:

```sh
node --test --test-concurrency=1 scripts/email-campaign-organisation-isolation.test.mjs scripts/email-campaign-sender-options.test.mjs scripts/email-campaign-delivery-reliability.test.mjs scripts/email-self-service-database.test.mjs
deno test --no-lock --allow-env --allow-read --allow-net=esm.sh,registry.npmjs.org supabase/functions/email-preference-centre/index.test.ts supabase/functions/resend-webhook/index.test.ts supabase/functions/email-sender-verification/index.test.ts supabase/functions/_shared/emailSendingDomain.test.ts
```

Provider references: [Resend account usage limits](https://resend.com/docs/api-reference/rate-limit)
and [permanent bounce events](https://resend.com/docs/webhooks/emails/bounced).

Pass 3 local verification (5 November 2026): 236 app regression tests passed;
113 affected delivery/settings tests passed again after the final edits. All 16
database tests passed, including 63 assertions in the two-organisation isolation
fixture. All 20 Deno endpoint/provider tests, five Edge Function type checks,
scoped frontend/service lint and whitespace checks passed. No full production
build was run under the repository's limited-memory rule. No release or live
email delivery was performed.

## Final local implementation and acceptance pass — 5 November 2026

The final pass owns the primary Email Marketing workflow and its shared backend;
it does not release changes to the public websites or Operating Console frontend.

`20261105170104_email_campaign_final_readiness.sql` follows the three prepared
migrations above. It fixes a scheduling blocker: `count(*)` returns `bigint`,
whereas `email_campaign_quote_usage` accepts `integer`. Dispatch now casts the
count explicitly, so valid scheduling can commit its recipient snapshot, usage
quote and leased job together. The integrated journey exercises this actual SQL
path rather than substituting a scheduling fixture.

Tracked clicks now use a service-only atomic RPC that checks both bearer tokens,
campaign and organisation before storing the event and changing recipient state.
Storage failure returns 503; no success redirect is emitted. Redirects are not
cached. Test-send transport failures retain a JSON/CORS response explaining that
acceptance is uncertain and the user should check their inbox before another
attempt. Quota storage failures remain retryable, and queued jobs retain a wait
reason for capacity/organisation controls rather than silently losing work.

The executive-only platform readiness endpoint now checks the fixed campaign
sender using its exact configured provider ID, independently of transactional
sender variables. It verifies the campaign enable flag and private budget, an
enabled callback with the expected signing secret, rejection of unsigned
requests, billing acknowledgement, and all nine required event subscriptions:

- `email.delivered`, `email.bounced`, `email.complained`, `email.opened`,
  `email.clicked`, `email.suppressed`;
- `domain.created`, `domain.updated`, `domain.deleted`.

Webhook discovery handles pagination and disabled callbacks. Provider calls have
a shared deadline and any missing/error state fails readiness. Provider and
signing credentials never appear in the response. The caller's Authorization
header is supplied with the casing required by the pinned Supabase client for
`getUser()` validation. Organisation settings receive only their own usage and a
generic account availability flag, including when allocation budgets are full.

### Verified locally

| Evidence | Result |
| --- | --- |
| App, import, content, editor, delivery, reporting and developer-access regression checks | 384 tests passed across 24 files |
| Database and existing campaign contract checks | 24 passed; includes 71 organisation-isolation/atomicity assertions |
| Hosted preferences/tracking, signed callback, sender verification and readiness checks | 41 passed |
| Backend type checks | Eight Edge entrypoints passed |
| Scoped changed app-test lint, whitespace checks and mobile routing regression | Passed |

The new `emailCampaignJourney.test.js` uses actual import/image-hosting services,
draft/preflight/schedule services, the delivery worker, tracking/unsubscribe
handlers and PostgreSQL migration functions. It uploads an owned image and imports
HTML, saves a draft, schedules a future campaign (proving it does not send early),
advances only the fixture's due time, dispatches both sender modes, records a
provider receipt and tracked click, reads the reporting service, and unsubscribes
only the intended organisation. PostgreSQL runs in an isolated PGlite database;
Storage/provider HTTP responses are local fixtures. Signature verification is
covered separately by the signed webhook tests. This is integrated local
acceptance evidence, not a hosted-browser journey or inbox-rendering proof.

The original source-contract checks for phases 1/4/7 now follow atomic preference/
tracking handling and the current performance component. Existing HTML/ZIP limits,
unsafe-content rejection, image ownership, retry recovery, sender separation,
consent and developer desktop/mobile access remain covered in the regression set.
No full production build was run under the limited-memory rule. Existing unrelated
module default-export warnings from the Vite configuration remain unchanged.

### Exact prepared release scope

Apply these migrations in order only during an explicitly approved release, using
`docs/database-release-runbook.md` and its target/recovery/dry-run checks:

1. `20261105154612_email_campaign_delivery_reliability.sql`
2. `20261105160335_email_campaign_sender_options.sql`
3. `20261105164327_email_campaign_organisation_isolation.sql`
4. `20261105170104_email_campaign_final_readiness.sql`

Pause campaign dispatch while releasing the schema and functions. Release the
reviewed `resend-webhook`, `email-campaign-worker`, `email-campaign-test`,
`email-campaign-content-check`, `email-campaign-track`, `email-unsubscribe`,
`email-preference-centre`, `email-platform-status`, `email-sender-verification`
and `email-sending-domain-create` bundles with their shared dependencies, plus the
primary frontend including the developer route/navigation corrections. Preserve
existing credential wrappers and other webhook consumers.

Configure the campaign-only private budget against actual central-account
allowances with headroom for transactional traffic; verify the exact
`updates.arch9.co.za` provider domain and campaign enable flag. Confirm callback
subscriptions and signing configuration before restarting dispatch. No customer
domain is a fallback for another domain. Do not remove provider safety blocks
when recipients opt in again. Preserve outbox/receipt records during rollback;
stop dispatch and reconcile any uncertain provider outcomes before resuming.

Still requiring a separately authorised live acceptance run: release/schema
application, actual provider/DNS/budget configuration, authenticated browser upload
round trip, delivery to an agreed test inbox, real signed callbacks, reporting,
unsubscribe, and Gmail/Outlook/mobile appearance and reply routing. No remote data,
DNS/provider settings, deployment, obsolete HomeSeekers configuration or real
email delivery was changed in this final pass.
