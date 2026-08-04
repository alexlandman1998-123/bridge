# Email Notification Branding Rollout

## Scope

This rollout covers the shared company branding applied to transactional emails sent through `supabase/functions/send-email`.

Converted priority notifications:

- buyer/client onboarding
- seller onboarding and seller portal activation
- seller onboarding submitted
- reservation deposit
- appointment notifications
- buyer offer link
- buyer offer submitted agent notification
- seller offer review
- offer decision notification

## Current Notification Brief

This brief covers current email and notification triggers, then the missing
commercial/enterprise notifications that should be added so agents, managers,
partners, and clients stay informed throughout the journey.

### Current Triggered Emails And Notifications

- Canvassing, public intake, and launch:
  - Public agency intake received in-app notification for the assigned agent.
  - Agent handoff notification for public intake submissions.
  - Arch9 launch / concierge lead confirmation email.
  - Arch9 launch / concierge internal notification.
  - Partner training request notification.

- Lead capture and enquiry:
  - Inbound lead acknowledgement email to the lead.
  - Property enquiry acknowledgement email.
  - Lead property share / property collection email.
  - Buyer property collection email.
  - Lead communication and assignment activity timeline entries.

- Buyer onboarding:
  - Client onboarding email.
  - Client portal link email.
  - Buyer onboarding submitted notification.
  - Buyer onboarding reminder emails.
  - Reservation deposit request email.
  - Reservation deposit received confirmation email.

- Seller onboarding:
  - Seller onboarding / seller portal link email.
  - Seller onboarding submitted notification.
  - Seller onboarding reminder emails.
  - Seller portal password recovery email.

- Appointments:
  - Appointment scheduled email.
  - Seller appointment scheduled email.
  - Appointment confirmed email.
  - Appointment updated email.
  - Appointment cancelled email.
  - Appointment rescheduled email.
  - Appointment confirmation required email.
  - Appointment reminder email.
  - Appointment documents required email.

- Offers:
  - Buyer offer link email.
  - Post-viewing offer link email.
  - Buyer offer submitted notification to agent.
  - Seller offer review email.
  - Offer decision notification.
  - Seller offer decision / accepted notification.

- Seller mandate, documents, and signing:
  - Seller mandate signing invitation email through the packet-bound signing endpoint.
  - Seller mandate signed confirmation email.
  - Final signed document dispatch email.
  - Seller document request email.
  - Seller document request reminder email.
  - Seller document completion and follow-up notifications.
  - Additional transaction document request emails currently reuse the bond intake notification template.

- Bond and finance:
  - Bond intake notification.
  - Bond originator intake notification.
  - Bond originator buyer introduction email.

- Attorney and legal:
  - Attorney quote email.
  - Attorney invite reminder email.
  - Attorney public intake / quote decision flow notifications.
  - Legal role financial document notifications and reminders.

- Commercial:
  - Commercial landlord onboarding email.
  - Commercial access request / decision notification email.
  - Commercial portal invitation and resend email.
  - Commercial access notification email.

- Transaction setup and partner access:
  - Organisation partner invitation email.
  - Transaction partner invitation email.
  - Transaction roleplayer introduction email.
  - Transaction roleplayer handoff / team handoff email.
  - Workspace, team, branch, agent, and developer access invite emails.

- Transaction progress and automation:
  - Transaction progress dispatch email.
  - Transaction progress resend email.
  - Cron-driven transaction progress notification.
  - Notification reminder dispatch for buyer onboarding, seller onboarding, seller documents, attorney invites, bond originator invites, and agent invites.

- Internal and utility:
  - Public demo enquiry internal email.
  - Legacy test email.
  - Bridge email test.
  - Generic test email.

### Missing Notifications To Add

- Lead and canvassing gaps:
  - New enquiry email to assigned agent when a public intake, inbound email lead, website enquiry, or portal enquiry is created.
  - New enquiry escalation email to branch manager/admin when no assigned agent exists.
  - Lead assigned email to the newly assigned agent.
  - Lead reassigned email to previous and new owner where appropriate.
  - Lead unassigned / returned-to-queue email to branch manager/admin.
  - Lead accepted / claimed confirmation to the assigning manager.
  - Lead stale warning when no first response is recorded inside the SLA window.
  - Lead lost / closed summary to manager when a high-value or enterprise lead is closed.

- Follow-up gaps:
  - First-response SLA reminder to assigned agent.
  - Escalation to branch manager when the first-response SLA is missed.
  - Follow-up due reminder for open lead tasks.
  - Missed follow-up escalation when an agent does not complete the task.
  - Dormant lead reactivation reminder after a configurable number of quiet days.
  - No-response nurture sequence for leads that have received an acknowledgement but no agent follow-up.

- Weekly and digest gaps:
  - Weekly agent pipeline digest: new leads, open follow-ups, stale leads, appointments, offers, and overdue client actions.
  - Weekly branch manager digest: lead volume, assignment gaps, SLA breaches, dormant leads, offer activity, and stuck transactions.
  - Weekly partner digest for attorneys/bond originators: new instructions, pending acceptances, outstanding documents, SLA risks, and completed milestones.
  - Weekly client-facing transaction update where a transaction is active but no major milestone email went out during the week.

- Transaction and roleplayer gaps:
  - Transaction created notification to assigned agent and matter owner.
  - Transaction owner changed notification.
  - Roleplayer assigned/reassigned notification to the new roleplayer and transaction owner.
  - Partner accepted invitation notification to transaction owner.
  - Partner declined invitation notification with replacement action required.
  - Stage changed notification for enterprise-controlled stages where downstream teams need visibility.
  - Transaction stalled / no meaningful activity escalation.
  - Transaction cancelled, archived, or reactivated notification to relevant internal parties.

- Offer and seller gaps:
  - Offer viewed by seller notification to agent.
  - Offer not reviewed reminder to seller.
  - Offer review overdue escalation to agent.
  - Seller mandate viewed but unsigned reminder.
  - Seller mandate signing overdue escalation to agent/manager.

- Buyer and client portal gaps:
  - Buyer onboarding opened notification to agent.
  - Buyer onboarding started but not submitted reminder/escalation.
  - Buyer onboarding submitted confirmation to buyer.
  - Client portal message received notification to assigned owner.
  - Client portal document uploaded notification to assigned owner or document reviewer.
  - Client portal document rejected/reupload required email to client.

- Bond and finance gaps:
  - Bond application started/submitted notification to assigned bond originator and agent.
  - Missing finance documents reminder to buyer.
  - Finance document uploaded notification to bond originator.
  - Bank submission notification to buyer/agent where applicable.
  - Bank feedback received notification to buyer/agent.
  - Bond approved, declined, or conditionally approved notification.
  - Bond SLA breach escalation to bond manager/regional manager.

- Attorney and legal gaps:
  - Attorney instruction accepted notification to transaction owner.
  - Attorney instruction declined notification with replacement action required.
  - Transfer stage updated notification to agent/client where relevant.
  - Document generated and ready for review notification.
  - Document change requested notification.
  - Document signed by one party but pending other party reminder.
  - Registration lodged/registered notification to agent, buyer, seller, and relevant partners.

- Commercial and enterprise gaps:
  - Commercial lead assigned notification to broker/operator.
  - Commercial access approved/declined confirmation to requester.
  - Commercial landlord onboarding opened/started/submitted notifications.
  - Commercial portal message received notification to internal owner.
  - Commercial deal stage change notification to owner/manager.
  - Enterprise account weekly portfolio digest across branches, agents, deals, SLA breaches, and partner bottlenecks.
  - Enterprise exception digest for overdue leads, overdue partner actions, high-value stalled deals, and unassigned work.

### CI Consistency Gaps

- All `send-email` handlers now need to remain on the shared branded layout with the dark header, light logo, consistent content area, CTA treatment, and branded footer.
- Seller portal password recovery uses the shared shell and should stay aligned with the account branding resolver.
- The public demo enquiry email is a direct Resend send path and should be moved behind `send-email` or a shared branded internal-notification helper.
- Supabase auth templates, including `supabase/templates/auth/email_change.html`, are outside `send-email` and need a separate branding pass.
- Additional document request emails currently reuse `bond_intake_notification`; they should get a dedicated branded document-request template.
- Lead assignment, new enquiry, weekly digest, SLA breach, and enterprise digest templates do not currently exist as first-class `send-email` routes.
- Every new route should log `notification_events` with a stable automation key, recipient role, channel, delivery status, dedupe key, and provider id.
- Every account-originated email should resolve organisation branding and sender identity through the shared resolver rather than hard-coded copy.
- All new templates need plain-text fallbacks and focused render tests in the same style as the existing branded template tests.

### Suggested Build Order

- Phase 1: Add first-class lead operations notifications: new enquiry, lead assigned/reassigned/unassigned, first-response SLA reminder, and manager escalation.
- Phase 2: Add follow-up automation: follow-up due, missed follow-up escalation, dormant lead reactivation, and no-response nurture.
- Phase 3: Add weekly digests for agents, branch managers, partners, clients, and enterprise accounts.
- Phase 4: Add transaction exception notifications: owner changed, partner accepted/declined, transaction stalled, stage changed, cancelled/archived/reactivated.
- Phase 5: Split overloaded templates into dedicated CI-consistent templates, starting with additional document requests and public demo enquiries.
- Phase 6: Add commercial-specific digests and exception notifications for brokers, landlords, operators, managers, and enterprise account admins.

## Controls

The central resolver reads rollout controls from Supabase function environment variables:

| Variable | Values | Effect |
| --- | --- | --- |
| `BRIDGE_EMAIL_BRANDING_ROLLOUT` | `enabled` or unset | Full database + payload branding. |
| `BRIDGE_EMAIL_BRANDING_ROLLOUT` | `payload_only` | Uses handler payload/default branding only. Skips database branding reads. |
| `BRIDGE_EMAIL_BRANDING_ROLLOUT` | `disabled` | Uses handler defaults only. Fast rollback for bad tenant data. |
| `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` | comma/space separated UUIDs | Limits database branding reads to listed organisations. Others use payload/default branding. |

Recommended production start:

```sh
BRIDGE_EMAIL_BRANDING_ROLLOUT=enabled
BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS=<pilot-org-id>
```

## Readiness

Apply `supabase/migrations/202607280002_email_notification_branding_readiness.sql` before enabling database branding. Then check:

```sql
select
  organisation_id,
  organisation_name,
  branding_row_present,
  display_name_present,
  logo_present,
  primary_color_present,
  secondary_color_present,
  support_email_present,
  support_phone_present,
  sender_name_present,
  email_branding_ready,
  resolved_email_branding_preview
from public.organisation_email_branding_readiness
order by email_branding_ready asc, organisation_name asc;
```

Minimum go criteria for a pilot organisation:

- `branding_row_present = true`
- `display_name_present = true`
- `primary_color_present = true`
- `secondary_color_present = true`
- `support_email_present = true`
- send one test of each pilot notification type and inspect rendered sender, logo/name, CTA color, support footer, and plain-text fallback.

Logo is recommended but not blocking because the layout has a text/initial fallback.

## Canary Plan

1. Deploy function code and migration to staging.
2. Run the focused suite:

```sh
deno check --config supabase/functions/send-email/deno.json \
  supabase/functions/send-email/services/emailBranding.test.ts \
  supabase/functions/send-email/content/bridgeEmailLayout.test.ts \
  supabase/functions/send-email/content/brandedTemplates.test.ts \
  supabase/functions/send-email/handlers/emailBrandingHandlers.test.ts

deno test --no-check --allow-read \
  supabase/functions/send-email/services/emailBranding.test.ts \
  supabase/functions/send-email/content/bridgeEmailLayout.test.ts \
  supabase/functions/send-email/content/brandedTemplates.test.ts \
  supabase/functions/send-email/handlers/emailBrandingHandlers.test.ts
```

3. Set `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` to one pilot organisation.
4. Send buyer onboarding, seller onboarding, appointment, and offer-link emails for the pilot.
5. Watch provider failures, support replies, and `communication_deliveries` prepared/sent/failed status for 24 hours.
6. Expand the allowlist in small batches.
7. Clear `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` only after readiness is clean for active organisations.

## Phase 10 Regression Suite And Release Hardening

Run the full notification release gate from the app package root before staging
promotion and again before production release:

```sh
npm run verify:notification-regression-suite
```

The suite runs:

- Deno typecheck for `send-email`, all handlers, content, services, and seller
  portal password recovery.
- Branded email shell/template tests.
- Reminder dispatch branded-shell test.
- Notification phase contract scripts for phases 3 through 10.
- `git diff --check` whitespace validation.

The service-only control operations must also remain available through the
`send-email` endpoint:

- `notification_controls_apply_queue` applies suppression, preference, mute,
  and quiet-hour gates to queued notification events.
- `notification_observability_snapshot` returns event, delivery, attempt,
  suppression, failure, and latency metrics.

After applying migrations, run the database release-readiness snapshot:

```sql
select public.bridge_notification_release_readiness_phase10(
  '<pilot-organisation-id>'::uuid,
  now() - interval '7 days'
);
```

Release is blocked when the snapshot returns `status = 'blocked'`, including
recent notification failures, stale queued notifications, or no active
notification definitions. `status = 'warning'` means the regression suite can
pass, but branding readiness gaps still need sign-off before widening beyond a
pilot organisation.

## Rollback

Fast rollback, keeping payload/default branding:

```sh
BRIDGE_EMAIL_BRANDING_ROLLOUT=payload_only
```

Hard rollback to handler defaults:

```sh
BRIDGE_EMAIL_BRANDING_ROLLOUT=disabled
```

No database rollback is normally required. The Phase 8 migration is additive and the resolver tolerates missing branding rows/tables. If a single tenant has bad branding, remove it from `BRIDGE_EMAIL_BRANDING_ORGANISATION_IDS` or correct the row in `organisation_branding`.

## Post-Rollout Audit

After expansion, run:

```sql
select *
from public.organisation_email_branding_readiness
where email_branding_ready is false
order by organisation_name asc;
```

Any active organisation returned here should be fixed before clearing the allowlist.
