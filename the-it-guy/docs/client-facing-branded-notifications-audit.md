# Client-Facing Branded Notifications Audit

Date: 2026-08-12

## 1. Current Notification Workspace

The current workspace is `src/pages/settings/SettingsCommunicationsTemplatesPage.jsx`, routed from `src/App.jsx` at `/settings/communications/templates`.

It edits copy-only settings for three email template keys:

- `client_onboarding`
- `seller_onboarding`
- `seller_onboarding_submitted`

Those settings are stored under `organisation_settings.settings_json.emailTemplates` through `src/lib/settingsApi.js` and normalized by `src/lib/emailTemplateSettings.js`.

Phase 1 now adds a read-only Client Journey Coverage panel backed by `src/services/clientCommunicationJourneyCatalog.js`. It maps canonical buyer/seller communications by audience, category, status, email policy, trigger source, CTA destination, likely source files, duplicate-risk notes, and next action.

Phase 1.5 adds the decision layer for each row: canonical decision, trigger owner, canonical event key, merge target, and implementation slice. This turns the audit into an implementation blueprint while still avoiding new outbound email behavior.

The workspace is still not a full notification control plane: it does not persist trigger ownership, active/draft/disabled status, reminder policy, previews, or send logs. It is now an audit/control-surface foundation for those later phases.

## 2. Where Triggers Originate

Notifications are generated through a combination of:

- Direct frontend/service invokes of the `send-email` Supabase function.
- Central-ish frontend notification/outbox services using `notification_events`.
- Database RPCs/triggers that queue `notification_events`.
- Dedicated Supabase edge functions that import email handlers directly.
- Activity-feed and in-app tables such as `transaction_notifications`, `client_portal_notifications`, `appointment_notification_events`, and `lead_communication_events`.

Important frontend/service origins include:

- `src/services/buyerOnboardingNotificationService.js`
- `src/services/notificationOutboxService.js`
- `src/services/transactionSharedProgressService.js`
- `src/services/appointmentNotificationService.js`
- `src/services/bondIntakeNotificationService.js`
- `src/services/transactionPartnerInvitationService.js`
- `src/services/leadPropertySharingService.js`
- `src/services/sellerPostMandateDocumentOrchestrationService.js`
- Large workflow pages such as `src/pages/agency/AgencyPipelinePage.jsx`, `src/pages/AgentListingDetail.jsx`, `src/pages/AttorneyTransactionDetail.jsx`, and `src/components/NewTransactionWizard.jsx`

Important edge/database origins include:

- `supabase/functions/send-email/index.ts`
- `supabase/functions/inbound-lead-email/index.ts`
- `supabase/functions/signer-signing-action/index.ts`
- `supabase/functions/send-mandate-signing-email/index.ts`
- `supabase/functions/dispatch-final-signed-document/index.ts`
- migrations that queue or claim `notification_events`, especially transaction progress, role-player, seller/portal, bond/legal, weekly digest, lead SLA, and commercial enterprise notification migrations.

## 3. Current Templates, Services, and Tables

Email delivery is centralized at the edge-function router `supabase/functions/send-email/index.ts`, which dispatches to handler files under `supabase/functions/send-email/handlers/`.

Shared branded layout support already exists in:

- `supabase/functions/send-email/content/bridgeEmailLayout.ts`
- `supabase/functions/send-email/services/emailBranding.ts`
- `supabase/functions/send-email/services/emailTemplateSettings.ts`
- `supabase/functions/send-email/services/resend.ts`
- `supabase/functions/send-email/services/communicationDeliveryLogging.ts`
- `supabase/functions/send-email/services/notificationEventLogging.ts`
- `supabase/functions/send-email/services/notificationControls.ts`

Key tables/migration-backed surfaces:

- `notification_events`: durable event/outbox queue, with category, trigger, channel, recipient, status, dedupe, dispatch attempts, resend linkage, and payload/metadata.
- `communication_deliveries`: delivery log for sent email/communication records.
- `lead_communication_events`: lead timeline communications.
- `lead_communication_preferences`: lead channel preferences.
- `notification_recipient_preferences`: recipient-level notification preferences.
- `notification_provider_webhook_events`: provider delivery webhooks.
- `transaction_notifications`: in-app transaction notification surface.
- `client_portal_notifications`: client portal notification surface.
- `appointment_notification_events`: appointment-specific email/in-app notification queue.
- `document_requirement_reminders` and related document reminder tables.

## 4. Existing Buyer/Seller Notifications

Existing or partial buyer-facing communications include:

- Lead acknowledgement: `lead_acknowledgement`.
- Buyer viewing availability request: `buyer_viewing_availability_request`.
- Buyer onboarding invite: `client_onboarding`.
- Buyer portal link: `client_portal_link`.
- Buyer offer link: `buyer_offer_link`.
- Bond originator intro: `bond_originator_buyer_intro`.
- Bond intake/status/legal-family events through `bond_attorney_legal_notification`.
- Additional document request: `additional_document_request`.
- Appointment scheduled/confirmed/reminder family.
- Transaction progress changed through shared progress notifications.

Existing or partial seller-facing communications include:

- Seller onboarding: `seller_onboarding`, `seller_onboarding_link`, `seller_portal_link`.
- Seller onboarding submitted: `seller_onboarding_submitted`, with agent and seller variants inside handler logic.
- Seller offer review: `seller_offer_review`.
- Seller viewing availability request: `seller_viewing_availability_request`.
- Mandate signing delivery, now guarded through packet-bound endpoints rather than generic `send-email`.
- Seller document request/reminder/escalation automation.
- Seller weekly listing digest.
- Seller/client portal notification events such as offer viewed and mandate reminder flows.

## 5. Already Supported From The Brief

- Central email router with explicit template types.
- Shared branded email shell with organisation branding, logo, colors, support details, and subtle Arch9 footer.
- Organisation-level copy overrides for selected onboarding templates.
- Delivery logging into `communication_deliveries`.
- Durable notification queue/outbox in `notification_events`.
- Dedupe keys and dispatch status tracking.
- Reminder dispatch and notification controls.
- Buyer portal, seller portal, OTP/signing, viewing, onboarding, document upload, and transaction progress routes.
- Activity-feed/in-app surfaces separate from email.
- Bond originator buyer intro.
- Transfer/role-player intro/handoff email handlers.
- Shared transaction progress publication and notification dispatch.

## 6. Fragmented Or Partial Functionality

- The automation contract lists many events, but the workspace only edits three copy templates.
- Client-facing journey concepts are spread across handlers, frontend service invokes, DB triggers, and page-level workflows.
- Offer accepted and property sold are not yet clearly modeled as buyer/seller journey milestones with finance branching.
- Bond/cash/hybrid communication is not canonical. Bond events exist; cash proof-of-funds and hybrid consolidated finance requirements are missing.
- Role-player intro exists generically, but buyer/seller-specific transfer attorney wording and trigger ownership need tightening.
- Transaction progress can email milestones, but it requires canonical milestone filtering to avoid noisy stage-change emails.
- Appointment notifications exist, but valuation/viewing/client journey distinctions are not consistently modeled.

## 7. Missing Functionality

- Persisted notification control rows for the canonical client communication event catalog.
- Full Notification Workspace control over status, trigger, audience, CTA destination, reminder behavior, preview, and history.
- Buyer confirmation for OTP signed/submitted.
- Buyer offer accepted congratulations with finance-aware next steps.
- Proof-of-funds-required email and confirmation.
- Hybrid finance consolidated communication.
- Seller-specific property sold milestone.
- Seller listing-live milestone, pending reliable listing triggers.
- Buyer/seller transfer document action-required templates.
- Buyer/seller registration completion templates.

## 8. Duplicate Or Overlap Risks

- `transaction_partner_invitation`, `transaction_roleplayer_intro`, and `transaction_roleplayer_handoff` can overlap for attorneys/originators.
- `additional_document_request`, bond document request events, legal packet signing events, and seller document request automation can describe similar client action requirements.
- `transaction_stage_changed` and `transaction_progress_changed` can overlap for milestones.
- `buyer_offer_link`, retired offer routes, OTP signing routes, and seller offer review routes need a single current source of truth per action.
- Appointment-specific `appointment_notification_events` may overlap with direct `send-email` appointment sends.
- Lead acknowledgements and lead operations notifications can be confused unless client acknowledgement and internal assignment are kept separate.

## 9. Architecture To Preserve

- The `send-email` edge-function router and handler pattern.
- The shared branded email layout and branding resolver.
- The `notification_events` outbox, dedupe, retry, and dispatch-attempt fields.
- `communication_deliveries` logging.
- Packet-bound guarded signing endpoints for mandate/OTP/final documents.
- Client portal deep-link routes and public token gates.
- Existing activity-feed/in-app notification surfaces for low-level operational events.

## 10. Recommended Target Architecture

Use `notification_events` as the canonical durable event/outbox layer and make the Notification Workspace the management surface over a typed client-communication catalog:

Workflow event -> canonical client communication event -> audience resolver -> email/no-email policy -> template resolver -> branding resolver -> CTA resolver -> queue/send -> delivery log -> activity/portal log.

Do not create a parallel queue. Add a journey catalog first, then progressively migrate current direct invokes and DB triggers to reference the canonical event keys.

Operating decisions now encoded in the catalog:

- Support buyer and seller together, using role-specific variants where the same milestone serves both sides.
- Start implementation with the offer accepted / property sold -> finance -> transfer-attorney handoff slice.
- Keep email volume conservative: action-required and major milestones get email; low-level operational events remain activity-only or portal-first.
- Use agency/partner branding first, with ARCH9 as the subtle platform footer.
- Treat the client portal as the source of truth; email should point clients to the current portal state rather than duplicate the full workflow.

## 11. Phased Plan

1. Add a canonical client communication catalog and show coverage in the existing workspace. Completed as a read-only Phase 1 foundation.
2. Lock catalog decisions: canonical event, trigger owner, merge/replace/activity-only policy, and first implementation slice. Completed as Phase 1.5.
3. Extend the catalog into persisted workspace controls only after event names and trigger ownership are stable.
4. Expand the shared branded email content primitives for property card, action card, next steps, role-player card, and CTA destinations.
5. Implement buyer/seller communications in the first vertical slice: onboarding, OTP ready/submitted, offer accepted/property sold, finance requirements, originator intro, transfer attorney intro.
6. Implement seller lead/listing communications once listing-live trigger ownership is reliable.
7. Map transaction progress to deliberate client milestones only.
8. Upgrade Notification Workspace with previews, status, controls, history, and logs.
9. Run end-to-end buyer/seller transaction tests.

## 12. Files Likely To Be Affected

- `src/pages/settings/SettingsCommunicationsTemplatesPage.jsx`
- `src/services/clientCommunicationJourneyCatalog.js`
- `src/services/notificationAutomationContract.js`
- `supabase/functions/send-email/services/notificationAutomationContract.ts`
- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-email/content/bridgeEmailLayout.ts`
- `supabase/functions/send-email/handlers/*`
- `src/services/buyerOnboardingNotificationService.js`
- `src/services/notificationOutboxService.js`
- `src/services/transactionSharedProgressService.js`
- `src/services/bondIntakeNotificationService.js`
- `src/services/transactionPartnerInvitationService.js`
- `src/services/appointmentNotificationService.js`
- `src/services/communicationDeliveryService.js`
- `src/lib/settingsApi.js`
- `src/lib/emailTemplateSettings.js`
- relevant `supabase/migrations/*.sql` files that queue or claim `notification_events`.
