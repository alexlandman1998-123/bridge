# Arch9 Email Campaigns — Phase 1: Trust, consent and deliverability

This source-only phase adds the compliance and sender-trust contract around the Phase 0 campaign engine. It must be released only after the active Supabase schema freeze is formally lifted.

## What Phase 1 enforces

- Every campaign names one active subscription category.
- The dispatcher snapshots only recipients with both organisation-wide `opted_in` consent and an explicit `subscribed` status for that category.
- A one-click unsubscribe remains an organisation-wide stop. The hosted preference centre lets a recipient restore only the categories they choose.
- Suppression is rechecked immediately before every provider call.
- Sender identities are refreshed from Resend through an authenticated admin-only Edge Function; browser users cannot mark a sender verified.
- Per-organisation sending policies bound worker batches and daily recipient volume. A paused policy prevents dispatch.
- `email_deliverability_health` surfaces health per sender identity. Complaint rate above 0.1% yields `paused`; bounce rate above 5% yields `warning`. Operations should set the organisation policy to paused before resuming a problematic domain.

## New server endpoints

- `email-preference-centre` is public but requires the recipient's unguessable unsubscribe token. It is deliberately configured with `verify_jwt = false`.
- `email-sender-verification` requires a signed-in sender-capable organisation user and checks Resend's domain API with `RESEND_API_KEY` held only in Supabase secrets.

## Release gate

Do not use `supabase db push --include-all` while the Phase 0 schema guard is active. Once the migration ledger is reconciled, apply the reviewed migration, deploy both new functions, provision the default subscription categories for each enabled organisation through the trusted server workflow, then test with a non-production audience.

## Campaign sender options — 5 November 2026

Prepared locally for the primary workspace. No database migration, provider
configuration, DNS change, deployment or real email send was performed for this
change. The older release-gate wording above is historical; use the current
database release runbook for any approved release.

Organisations can save two independent sender options:

| Option | From address | Replies |
| --- | --- | --- |
| Send through Arch9 | Organisation name via Arch9, `noreply@updates.arch9.co.za` | Organisation's saved inbox or explicit campaign reply-to |
| Own domain | A verified sender on that organisation's connected domain | Organisation's saved inbox or explicit campaign reply-to |

Both use the platform's server-side `RESEND_API_KEY`. Customers never supply or
receive that credential. The Arch9 address is fixed by the backend; customers
can edit their display name, reply inbox and default choice. Sender type is
immutable: changing between options means selecting a different sender identity
in the campaign. There is no automatic fallback after a domain failure.

The shared domain is held in a separate, server-only readiness record, not a
customer's domain library. Customers cannot claim `arch9.co.za` or its subdomains.
Saving an Arch9 identity does not assert that the platform domain is ready.
Preflight, scheduling, test sending, quota reservation and delivery enforce the
selected option's readiness. Provider ID and domain name must both match before
the server accepts proof for `updates.arch9.co.za`.

Custom-domain and shared-domain verification stay independent. A failed custom
domain does not change platform readiness, and a failed platform domain does
not stop a verified custom sender. Organisation safety pauses and existing
consent/category checks still apply to both. Data isolation and shared-account capacity controls are now implemented locally
in pass 3, followed by the final acceptance pass documented in
`email-campaign-phase-5-operations.md`. One Resend account still has account-wide
provider restrictions.

### Configuration and release dependency

The additive migration is
`20261105160335_email_campaign_sender_options.sql`. It defaults shared sending
to disabled. During an approved release, verify the exact domain in the central
Resend account, then configure these server-only settings:

- `ARCH9_CAMPAIGN_RESEND_DOMAIN_ID`: the Resend ID for `updates.arch9.co.za`.
- `ARCH9_CAMPAIGN_SENDING_ENABLED`: exactly `true` when shared campaign sending
  is approved for activation.

Missing configuration leaves the shared option awaiting activation and does not
affect custom-domain delivery. The shared path never uses the transactional
`ARCH9_RESEND_FROM_EMAIL`/`RESEND_FROM_EMAIL` address as a fallback.

Apply the prepared delivery-reliability migration first, then the sender-options
migration. Deploy the reviewed `resend-webhook`, `email-campaign-worker`,
`email-campaign-test`, `email-sender-verification` and
`email-sending-domain-create` bundles with their shared helpers, and the primary
frontend. Keep the deployed credential wrappers and the pass-one release order.
The custom-domain verification endpoint retains its existing scope and API.

Settings can then refresh platform readiness and activate an eligible
organisation's existing bounded sending policy. This does not clear an
operator block or a safety pause. A controlled live journey and actual inbox
rendering remain required in the separately approved live verification pass.

### Focused verification

Run checks serially on the limited-memory machine:

```sh
node --test --test-concurrency=1 scripts/email-campaign-sender-options.test.mjs scripts/email-self-service-database.test.mjs scripts/email-campaign-delivery-reliability.test.mjs
```

From `the-it-guy/`, run the focused Vitest files for `emailCampaignDelivery`,
`emailSelfService`, `EmailCampaignSettings` and `EmailCampaignBuilder`, with
`--maxWorkers=1` and a 1024 MB Node heap cap. These cover both From addresses,
the shared provider credential, reply routing, pending/wrong provider proofs,
reserved domains, no fallback, defaults, editing, pauses and existing content
and delivery behaviour. SQL fixtures use the actual additive migration and
verify that platform configuration cannot be read or changed by browser roles.
The signed webhook and sender-verification fixtures exercise separate custom
and platform domain events and partial verification failures without contacting
the provider or sending mail.

Local result: 225 interface/service/content tests, 15 isolated database checks
and 14 backend/domain tests passed. All five changed Edge entrypoints passed
Deno type checking. Scoped frontend lint reported zero errors and one existing
unused-prop warning. A full production build and live inbox verification were
not run in this pass.
