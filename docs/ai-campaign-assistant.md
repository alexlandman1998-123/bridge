# AI campaign assistant

This is a source implementation for the primary `the-it-guy/` Arch9 workspace.
No hosted migration, deployment, paid generation or email send was performed.

## Existing architecture and implementation

- React 19 / Vite 7 frontend, Node API routes deployed with Vercel, Supabase Auth/Postgres/RLS and Edge Functions. The public Next.js website and internal admin app have independent builds and are outside this change.
- `private_listings` and `listing_media` supply listing facts and existing photographs. CRM `leads`, `contacts` and `lead_requirements` supply saved buyer requirements. Listing, lead and contact reads use the authenticated user's Supabase client and current RLS, including branch/record restrictions.
- Organisation branding is read from `organisation_branding` and `organisations`. The shared versioned email renderer remains authoritative for layout, escaping, branding, links and the protected footer.
- Existing `email_campaigns`, revision history, saved audiences, category consent, suppressions, sender verification, preflight, email usage quotes and recipient/job claims are reused. The Resend worker retains its provider idempotency keys. Sending still requires the existing principal/admin authority; an agent can prepare and save a draft.
- Existing delivery billing has a `no_charge` quote adapter and a separate email ledger. This feature adds an independent AI usage ledger, without changing subscription billing, charging wallets or claiming a confirmed commercial consumption rate. No reusable model-generation integration was found in the inspected primary server/API and Edge Functions.

## Agent experience

Open **Create with AI** from Email Campaigns or a listing's Marketing snapshot.
Name the campaign in Details and choose a send permission category. Select a listing,
new listing / price reduction / show day, English or Afrikaans, and an optional brief.
Show days require future start/end times in SAST; reductions require confirmation
of the previous price above the saved current asking price.

Preview matching buyers, or explicitly preview the current audience selected in
the normal Audience step. Generate once for the campaign, edit the five copy fields,
request shorter/conversational/custom wording or translate to Afrikaans, then use
the result in the ordinary draft. The existing editor also edits property highlights,
photographs, links and layout. Ordinary saves and revisions retain AI provenance.
There is no model call when saving or sending a draft.

Review includes final-content preview, sender, current eligible count, a fixed send
time and delivery quote. An explicit **Approve reviewed send** uses a token covering
the saved row, sender record, audience rules/count, quote and time. Edits or changed
server context require a fresh review. Immediate sends use a reviewed time one minute
ahead; expired times require another review. The database trigger rejects direct
dispatch of an AI-marked draft without this approval path. Existing cancellation
and rescheduling controls are unchanged.

At delivery the worker independently rechecks suppression, general consent,
category subscription and address validity. Eligibility read failures leave the
recipient queued. Existing atomic claims and provider keys prevent duplicate sends.

Buyer matching uses structured requirements and invoker RLS, not model-selected SQL.
It checks active listings/requirements, matching consent, location, price range,
property category/type, bedrooms and bathrooms. Requirements with garage/parking,
size, must-have or deal-breaker constraints are conservatively excluded because
this implementation cannot prove those facts. Nice-to-haves do not gate a match.
Zero matches use an explicit non-existent contact ID, never the legacy empty-array
meaning of all contacts. Consent/subscription/suppression checks remain separate.

## Provider, limits and accounting

The provider boundary is `server/services/aiCampaignProvider.js`; shared authenticated
actions are in `server/services/aiCampaignApi.js` behind `/api/marketing/ai-campaign`.
The first route is direct Anthropic managed funding. No gateway, customer credentials,
paid fallback, external MCP connection or background AI runtime is enabled.

Generation uses one structured content tool, no database/action tools, at most one
repair, no network retries, 1,200 output tokens per call, a 24,000-byte request bound
including schema/system context, and a 25-second timeout per call. Model prose cannot
contain numbers, URLs, HTML or merge tokens. Price/address/property highlights/event
times are rendered independently from server-authorised or agent-confirmed facts.
Semantic claims still need human review; output validation is not proof of truth.
Listing text and brief instructions never alter permissions or tool availability.
Documents, FICA, banking data and recipient records are not sent to the model.

Agency budget rows are locked before summing monthly UTC usage and reserving the
maximum two-call allowance with input headroom. All agents share that agency cap.
Actual reported token usage reconciles the allowance. Unknown provider outcomes or
interrupted calls retain the allowance until an operator reconciles evidence; they
are never automatically released into spendable budget. This is budget accounting,
not a customer invoice. User/agency/campaign/feature/provider/model/funding/status
and cost are recorded independently from delivery and advertising.

Request IDs are bound to actor, agency, campaign and a fingerprint of input, listing
and branding. Completed retries return stored output; pending/failed retries do not
call a second model. There are no per-recipient AI calls. The usage viewer shows the
latest 20 accessible records, with own-user access or existing agency send authority.

## Configuration and release dependencies

The append-only migration is `20261025190213_ai_campaign_assistant.sql`. Existing
email foundation, dynamic audience delivery, visual-builder/revision, branding,
private-listing and lead-requirement schema must be present. Only this new migration
is to be added for this feature; do not edit earlier migrations.

Server configuration: `ANTHROPIC_API_KEY`, `SUPABASE_URL` (or `VITE_SUPABASE_URL`),
`SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`) and `SUPABASE_SERVICE_ROLE_KEY`.
Only the public Supabase key is used for authenticated data reads; the privileged
client is used solely for accounting RPCs. Never prefix the provider/service key
with `VITE_`. No credentials are stored in this repository or passed to the browser.

The seeded `claude-haiku-5-5` model is disabled by default, with configurable USD
provider rates of 0.10 input / 0.50 output per million tokens for this bounded prompt
size. Check rates and account availability before activation. An operator must enable
the model and provision the agency's `ai_campaign_budgets` row with that model,
an explicit monthly cap and optional writing preferences. No agency receives an
automatic paid allowance. The table supports configuration, but this adapter's tested
request contract is Haiku; do not enable other model families without contract tests.

The dependency installation attempt failed with ENOSPC, so the implementation uses
Node's built-in `fetch` and the official Messages API instead of adding an SDK.
Official references checked: [Messages API](https://platform.claude.com/docs/en/api/messages/create),
[Haiku model/rates](https://platform.claude.com/docs/en/models/haiku-5-5/overview),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
No live provider call has yet confirmed this agency's model entitlement or output quality.

Release needs explicit target approval, the applicable Supabase guard and database
release runbook, migration application, the primary app/API deployment and deployment
of `email-campaign-worker` with shared modules. A verified sender, consented audience,
public property link and permanent usable photographs remain prerequisites. Preserve
the existing app/worker for rollback; retain ledger rows and saved drafts. Local Vite
generation refuses hosted database writes and uses local Supabase or a mocked fixture.

## Focused verification

Run serially from `the-it-guy/` with a conservative heap:

```sh
NODE_OPTIONS=--max-old-space-size=1024 node --test --test-concurrency=1 scripts/ai-campaign-database.test.mjs server/services/aiCampaignApi.test.js server/services/aiCampaignProvider.test.js
NODE_OPTIONS=--max-old-space-size=1024 npx vitest run src/components/marketing/__tests__/AiCampaignAssistant.test.jsx src/services/__tests__/aiCampaignDocument.test.js src/components/marketing/__tests__/EmailCampaignBuilder.test.jsx src/services/__tests__/emailCampaignDelivery.test.js src/pages/__tests__/EmailWorkspaceNavigation.test.jsx --maxWorkers=1 --no-file-parallelism
npm run test:email-campaign-landing
```

Database tests execute the actual migration in isolated in-memory Postgres with RLS.
API/provider tests mock data/provider boundaries. Delivery tests invoke the actual
worker with mocked Resend. Browser/UI tests use fixtures, not hosted writes. These
checks do not establish a live deployment or inbox delivery. The full app build and
`check:app` remain unverified on this limited-memory machine. Before rollout, run
the build-ready suite in a suitable environment, then an explicitly approved internal
recipient test for branding, links, language, suppression and account-specific usage.

Local results on 25 October 2026: **80 tests passed** (63 UI/rendering/delivery and
17 API/provider/database checks), and the established email landing check passed.
Scoped lint had no errors and the existing unused `AudienceStudio` warning. A mocked
browser fixture at 390 × 844 confirmed audience preview, editable generation,
Afrikaans revision and draft application, with document width equal to viewport
width (390px). The [mobile screenshot](../output/playwright/ai-campaign-mobile-20261025.png)
shows the generated editor. The fixture never used hosted data, a model or Resend.

Agency-funded credentials, external assistant MCP, follow-up tasks, scheduled AI,
autonomous sending, ad execution and generative media remain later phases.
