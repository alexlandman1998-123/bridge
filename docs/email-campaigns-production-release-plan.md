# Arch9 email campaigns — controlled production release plan

Status: planned; no database or production function mutation is authorised by
this document. Prepared 11 September 2026.

## Release decision

Release the email-campaign feature as one additive, dependency-ordered train.
Do not release only the visual campaign page: its workspace reads the audience,
tag, asset, and experiment tables introduced later in the train.

The existing schema-freeze guard remains in force. This plan is the evidence
and sequence required to request a scoped exception; it is not permission to
run `supabase db push`, `supabase db reset`, or `supabase migration repair`.

`20260911152751_marketing_event_operations_hardening_phase9.sql` is excluded.
It belongs to marketing-event RSVP operations, not bulk email campaigns.

## Scope and exact order

Before treating any file as absent, compare the production migration ledger and
the live catalog. A historical local-only file can be already present or only
partially present in production. For every row below, select exactly one action:

- **repair only after smoke:** all objects and behaviour are already live.
- **apply original after dependency check:** the objects are absent and the
  version is absent from the production ledger.
- **corrective migration required:** anything is partially live or differs.

Never replay an original file in the third case.

| Order | Migration | Purpose | Depends on |
| --- | --- | --- | --- |
| 0 | `20260909113000_email_campaigns_foundation.sql` | Core contacts, consent, campaigns, recipients, dispatch queue, policies, tracking and baseline RPCs | `organisations`, branches, memberships |
| 1 | `20260911144133_email_client_audiences_phase1.sql` | Saved audiences, contact tags and static membership | 0 |
| 2 | `20260911144423_email_client_audience_search_phase2.sql` | Enquiry/search fields and index | 0 |
| 3 | `20260911144529_email_audience_preview_phase3.sql` | Audience eligibility detail RPC | 0–2 |
| 4 | `20260911144646_email_contact_tags_phase4.sql` | Legacy-tag sync and safe tag assignment RPC | 1 |
| 5 | `20260911144903_email_assets_phase6.sql` | `email-assets` storage bucket, policies and asset metadata | 0 |
| 6 | `20260911145837_email_personalisation_phase2.sql` | Recipient snapshot enrichment for merge fields | 0 |
| 7 | `20260911145924_email_experiments_phase3.sql` | Experiment configuration and RLS | 0 |
| 8 | `20260911150030_email_automation_journeys_phase4.sql` | Draft-only journey model and RLS | 0 |
| 9 | `20260911150323_email_audience_imports_phase5.sql` | Consent-preserving CSV import audit and RPC | 0 |
| 10 | `20260911150530_email_campaign_approvals_calendar_phase6.sql` | Approval guard, audited decisions and calendar fields | 0 |
| 11 | `20260911150919_email_experiment_dispatch_phase3_completion.sql` | Sample allocation, holdout, winner selection and experiment result fields | 7 |

## Freeze-exception gate

All of the following must be captured in the release ticket before a scoped
production application is requested:

1. A fresh `npm run supabase:guard` result with zero duplicate local
   timestamps. It currently passes but also confirms the broad-push freeze.
2. Production migration-list evidence for every version in the table.
3. Live catalog evidence for every referenced table, policy, trigger, RPC,
   index, storage bucket and view. Record absent/present/partial per file.
4. Staging evidence for the exact selected action and exact SQL checksum of
   every file. Production must use the same reviewed files.
5. Recovery evidence meeting the repository's `RECOVERY_LOCKED` gate: PITR or
   an accepted physical restore, plus a named rollback owner and release
   window.
6. Security review of the two new service-role-only experiment RPCs. Confirm
   `PUBLIC`, `anon`, and `authenticated` cannot execute them, and that all
   new public tables have RLS and appropriate grants.

If any file is partial, stop this train and create a small corrective migration
for that file only. Do not widen the exception to unrelated migrations.

## Execution sequence

Use the repository's existing one-version-at-a-time staging and production
release runners described in [the database runbook](database-release-runbook.md).
They preserve the freeze and require evidence between application and ledger
recording. Never use a bulk CLI push for this train.

### 1. Staging database

For each approved migration, in the order above:

1. Capture the pre-state definitions and row counts.
2. Apply one exact file through the scoped staging runner.
3. Confirm the expected object, index, RLS policy, trigger, function ACL and
   Data API access.
4. Run its focused source contract test plus a live staging behavioural check.
5. Record staging ledger and verification evidence before advancing.

At the end, run the Supabase security advisors and resolve any new critical or
high finding introduced by this train. Existing unrelated findings must be
recorded separately, not silently accepted as email-release evidence.

### 2. Functions, secrets and providers

Only after the database train is verified, deploy these functions from the
reviewed commit:

- `email-campaign-worker`
- `email-campaign-test`
- `email-campaign-track`
- `email-unsubscribe`
- `email-preference-centre`
- `email-sender-verification`
- `resend-webhook`

Set and verify, without logging their values:

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_CAMPAIGN_WORKER_SECRET` — generate a high-entropy unique value
- `ARCH9_PUBLIC_URL` — the canonical HTTPS application origin

Resend requirements:

- The marketing sending domain must be verified with DKIM and SPF.
- Configure the Resend webhook to the deployed `resend-webhook` endpoint and
  subscribe to delivered, opened, clicked, bounced, complained and related
  suppression events supported by the implementation.
- Confirm the signing secret matches `RESEND_WEBHOOK_SECRET`.

Schedule the worker at a short interval (recommended: every minute) with an
authenticated POST to `email-campaign-worker` and the
`x-arch9-email-worker-secret` header. Store that secret in the scheduler's
secret store; never place it in a URL, client bundle, source file, or job log.

### 3. Production database and frontend

Promote one version at a time only after the same version has passing staging
evidence. Verify before ledger recording, then deploy the frontend and the
functions from the same reviewed commit. Do not expose the frontend routes
until all selected database versions and functions are confirmed.

## Mandatory smoke sequence

Use a dedicated internal organisation and addresses controlled by the release
team. Never use customer contacts for a release test.

1. Create or verify a sender identity on the verified Resend domain.
2. Create one opted-in, subscribed internal recipient and one opted-out test
   recipient in the same organisation.
3. Save a campaign containing a merge token, tracked HTTPS link and image.
4. Use the non-sending preview and send a test message.
5. Schedule a live internal-only campaign. Confirm the worker queues and sends
   exactly the opted-in recipient, never the opted-out recipient.
6. Open and click the message; confirm signed webhook ingestion, event rows,
   link attribution and report totals.
7. Use the unsubscribe link. Attempt a second send and verify suppression at
   audience snapshot and immediately before provider delivery.
8. Upload a small allowed image, import a two-row CSV (one valid consented,
   one invalid address), and verify import audit counts and no opt-out revival.
9. Request and approve an approval-required campaign; verify scheduling fails
   before approval and succeeds after it.
10. In staging, run an A/B campaign with at least ten internal recipients;
    verify control/variant allocation, holdout non-delivery, winner selection,
    release and report result. Do not enable A/B tests in production until this
    test passes.

Automation journeys remain draft-only in this release. Do not mark them as
live or advertise event-triggered sending until the enrolment/event worker is
implemented and separately certified.

## Rollback and containment

All selected migrations are additive. Routine rollback must preserve contact,
consent, campaign, event and experiment evidence; do not drop tables or
restore the entire database as a first response.

| Failure point | Immediate containment | Recovery |
| --- | --- | --- |
| Sender, consent, or worker defect | Pause the organisation sending policy; disable the worker scheduler | Revert the frontend/function commit, correct the defect in a new forward migration or function deploy, then repeat the smoke sequence |
| Webhook verification/attribution defect | Keep sends paused; retain events and provider IDs | Correct the webhook function or secret, deploy, and replay only provider events that the provider supports safely |
| CSV import defect | Hide import entry point and stop imports | Preserve import audit; issue a reviewed corrective migration. Never bulk-delete contacts without a separately approved, exact-target recovery plan |
| Approval defect | Disable approval-required campaigns and pause new scheduled sends | Correct the guard/RPC forward; preserve the approval history |
| A/B experiment defect | Pause the affected campaign and worker scheduler | **Do not revert to the old worker while an experiment is `running`**: it does not understand holdouts and could send the remainder early. Resolve or cancel the experiment using the new worker, then roll forward with a fix |

Feature containment is preferred over schema reversal. The database objects may
remain in place while their UI routes and scheduler are disabled.

## Release sign-off

Production may be marked ready only when all are true:

- Exact migration actions, staging evidence and production evidence are
  attached for every selected version.
- Database/function/frontend commit identifiers match the approved release.
- Domain, secrets, webhook signature and worker schedule are verified.
- The smoke sequence passes with internal recipients.
- A named operator owns monitoring of worker failures, Resend webhooks,
  suppression/complaint rates and the daily send limit for the first launch
  window.
