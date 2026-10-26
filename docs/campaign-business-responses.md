# Campaign response links

This is local primary-workspace implementation. The new migration has not been
applied to a hosted database, and the API/UI have not been deployed. No real form
submission, customer contact, email, subscription change or other remote write
was performed while implementing or testing this flow.

Owners and agency managers can create a response link from a saved campaign and
an existing active agency enquiry form or the campaign agent's active digital-card
form. The chosen purpose is valuation, seller, buyer or personal introduction.
Valuation/seller links use the existing selling form, buyer links use the buying
form, and introductions ask the visitor to submit their own buying/selling request.
No third-party contact data is requested by the referral workflow.

Creation is an explicit action. The link captures the exact campaign revision,
responsible agent and reviewed follow-up delay. A link remains valid when a later
playbook save increments the campaign revision; its creation revision is retained
as provenance. Revocation is permanent for that token. Existing CRM work is kept.
A replacement can be created from the current saved campaign revision.

The public form must still belong to the campaign agency, remain active and accept
the requested enquiry type. The responsible agent must remain an active/accepted
agency member. A disabled form, revoked token, missing campaign or inactive owner
stops new submissions. There is no fallback to an unattributed submission.

## What a submission records

The existing public API recognises the explicit unguessable `campaignResponse`
token. It validates the form and current privacy-policy version, then calls one
service-role-only, security-invoker RPC. The RPC repeats scope, intent, contact,
consent, routing, size, rate-limit and idempotency checks. Its writes are atomic:

- Reuse a same-agency contact where safely matched, without rewriting its identity.
- Reuse a compatible open agency lead and preserve its owner, or create a new lead
  assigned to the campaign's responsible agent.
- Create a buyer requirement if missing, with future-match permission **false**.
- Record the accepted submission and its original campaign revision.
- Associate the lead with the campaign as a `form` enquiry.
- Create one CRM follow-up task and an activity for this response request.
- Record privacy permission and separately selected optional Email marketing
  consent in a private receipt.

An existing lead's active owner receives the follow-up. If that owner is no longer
an active agency member, the task goes to the campaign's responsible agent; the
lead itself is not silently reassigned. A due-date delay means calendar days from
submission in the existing South African calendar context, not guaranteed contact.

Public-origin enquiries have `source_kind='public_form'` and a NULL staff recorder.
Tasks/activities are system-created, without falsely attributing the submission to
a logged-in staff member. The prior authenticated enquiry grants and RLS remain;
ordinary callers cannot insert that public-origin field.

Exact retries return the saved outcome and create no duplicate CRM work. Reusing
the same request key with different details is rejected. Rate limits retain the
existing five responses per ten minutes / fifteen per hour per form and hashed IP;
exact accepted retries remain recoverable. The public response contains no lead,
contact, task, campaign or connection identifiers.

Privacy consent permits the agency to respond to this enquiry. The optional Email
marketing checkbox defaults off and cannot replace privacy consent. Its consent
version is recorded separately. **No email/WhatsApp subscription is created or
changed**, including previously unsubscribed or suppressed contacts. Normal channel
permission and suppression rules remain authoritative for subsequent marketing.
The response API performs no direct channel dispatch and changes no subscription.
Ordinary configured CRM triggers can still queue the agency's acknowledgement to
the enquirer and staff notifications when a genuinely new lead is created.
Existing WhatsApp automations retain their sender-specific consent and opt-out
checks. Marketing permission is not inferred from an enquiry or acknowledgement.

## Live-catalog preparation audit

A read-only audit on 26 October 2026 found the production lead-email dispatcher
and WhatsApp automation worker scheduled every minute. A new buyer/seller lead
queues staff-email and client-introduction jobs through existing database triggers;
the intake submission also invokes the established staff-notification outbox.
The client-introduction worker checks a valid recipient and current delivery
configuration. Its ordinary content acknowledges the requested enquiry and gives
the assigned agent's contact details. It does not subscribe the person or perform
property matching. Delivery is possible unless the relevant worker configuration
disables it; optional future-marketing consent is a separate decision.

There were no enabled WhatsApp automation rules at the audit time. Future enabled
rules can run, but dispatch rechecks a connected sender, current sender ownership,
the existing conversation's opted-in permission and later opt-outs. The campaign
response creates no such permission. Existing public intake uses these same CRM
triggers in addition to its own established handoff. No historical/test flags were
invented to suppress ordinary processing.

This evidence comes from live function/catalog definitions and schedule metadata,
not from submitting a production enquiry or inspecting secret values. The isolated
tests do not include every production trigger. Before any production form canary,
use an approved sandbox or controlled agency/recipient and verify acknowledgement,
staff outbox behavior, recipient/agent ownership, opt-out preservation and no future
matching when the new requirement's permission is false. Do not assume test
suppression merely because an address looks synthetic. No live submission or
message delivery was performed during this audit.

## Activation and source files

Review/apply only the exact additive migration
`supabase/migrations/20261025205056_campaign_business_responses.sql` through the
repository database-release procedure after explicit approval. It depends on the
existing campaign plans, public intake links/submissions, CRM requirements/tasks
and `marketing_campaign_enquiries` foundations. It adds response-link/receipt
tables, narrow owner/manager RLS, two invoker functions and public-origin enquiry
metadata. Do not apply the working tree's other pending migrations blindly.

Relevant implementation:

- `the-it-guy/src/services/campaignResponseLinkService.js`: authenticated link
  list/create/revoke and share URLs, with actor/agency/revision checks.
- `the-it-guy/server/services/campaignPublicResponse.js`: bounded public contract,
  current route validation, separate consent and atomic RPC adapter.
- `the-it-guy/server/services/publicAgencyIntakeApi.js`: explicit token branch;
  ordinary public intake remains on its established path.
- `the-it-guy/src/services/agencyPublicIntakeService.js`: forward token context.
- `the-it-guy/src/pages/PublicAgencyIntakePage.jsx`: existing forms and separate
  optional marketing checkbox for campaign responses only.
- `the-it-guy/src/components/marketing/CampaignResponseLink.jsx`: campaign detail
  UI, including explicit create/copy/revoke and reviewed playbook routing.

Focused checks, run serially on the limited-memory machine:

```sh
cd the-it-guy
node --test --test-concurrency=1 scripts/campaign-business-responses.test.mjs server/tests/campaignPublicResponse.test.js server/tests/publicAgencyIntakeApi.test.js
npx vitest run src/services/__tests__/campaignResponseLinkService.test.js src/pages/__tests__/PublicAgencyIntakePage.campaign.test.jsx --maxWorkers=1
```

The database check uses isolated PGlite and the actual new migration plus original
intake/enquiry migrations. It covers permissions, tenant/owner/revision changes,
public actor provenance, revocation, idempotency, separate consent, unchanged opt-out,
existing ownership, rate limits and rollback when a downstream write fails. API,
client service and form checks use mocked boundaries. They establish local behavior;
hosted schema acceptance and a deliberately approved internal test remain release
work. Before-copies of modified source live in
`output/campaign-business-20261025/before/`.
