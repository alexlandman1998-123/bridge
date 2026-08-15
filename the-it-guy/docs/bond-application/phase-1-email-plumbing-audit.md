# Phase 1 - Buyer Bond Email Plumbing Audit

## Purpose

This phase freezes the current buyer bond application email plumbing before the link builder and token enrichment work starts. It identifies the active trigger, service chain, email template, CTA field, available metadata, and the current gap that Phase 2 must close.

## Current Flow Map

| Step | Event or action | Code owner | Template or output | Link source |
| --- | --- | --- | --- | --- |
| 1 | Signed OTP handoff activates the selected bond originator | `src/lib/api.js` `markTransactionSignedOtpReceived` flow | Calls `notifyBondIntakeStartedForOnboarding` after `activateSelectedBondOriginatorForOnboarding` returns `activated` | No portal link is passed in this call today; metadata only includes `source: 'signed_otp_received'`. |
| 2 | Originator intake event is recorded | `src/services/bondIntakeNotificationService.js` `notifyBondIntakeStartedForOnboarding` | Sends `BOND_INTAKE_RECEIVED` for internal originator intake | Uses originator path metadata or `/bond/applications`. |
| 3 | Buyer intro event is recorded | `src/services/bondIntakeNotificationService.js` `notifyBondIntakeStartedForOnboarding` | Sends `BUYER_BOND_ORIGINATOR_INTRO` | Builds buyer application link through `buildBuyerBondApplicationLink`. |
| 4 | Email payload is built | `src/services/bondIntakeNotificationService.js` `sendEmailIfAllowed` and `enrichNotificationMetadata` | Uses email type `bond_originator_buyer_intro` for buyer intro events | Stores the final CTA in `metadata.applicationLink`. |
| 5 | Edge function routes the email | `supabase/functions/send-email/index.ts` | Routes `bond_originator_buyer_intro` to `handleBondOriginatorBuyerIntroEmail` | Passes through `metadata.applicationLink`. |
| 6 | Buyer email template renders | `supabase/functions/send-email/handlers/bondOriginatorBuyerIntro.ts` | Subject defaults to `Complete your bond application` and CTA label is `Complete Bond Application` | Reads `metadata.applicationLink` into `portalLink`. |
| 7 | Communication catalogue describes the journey | `src/services/clientCommunicationJourneyCatalog.js` | Finance buyer introduction entry with CTA `Complete bond application` | Catalogue only describes the intent; it does not build the URL. |

## Metadata Available Today

The signed OTP activation path currently passes these buyer-relevant values into the notification transaction object:

- `buyer_name`
- `buyer_email`
- `finance_type`
- `bond_workspace_id`
- `bond_region_id`
- `bond_workspace_unit_id`
- active `transaction_role_players`
- `unit_number`
- `development_name`

The call also passes the submitted `onboardingFormData` as `formData`.

## Current Link Behaviour

`buildBuyerBondApplicationLink` accepts:

- `metadata.applicationPath`
- `metadata.portalPath`
- `metadata.clientPortalPath`
- `transaction.buyerPortalPath`
- `transaction.buyer_portal_path`
- `transaction.clientPortalPath`
- `transaction.client_portal_path`

It normalizes buyer portal routes to `/client/:token/bond-application`, appends `/bond-application` for the temporary `/client-access` fallback, and can return an absolute URL when a base URL or absolute input is available.

## Phase 1 Finding

The buyer intro email can now point at the bond application sub-route, but the production signed OTP handoff path does not yet enrich the notification call with a real buyer portal token or portal path.

That means Phase 2 must create or reuse one canonical link builder and Phase 3 must make the real portal token/path available before `notifyBondIntakeStartedForOnboarding` sends the buyer intro email.

## Immediate Guardrails

- Buyer intro email type must remain `bond_originator_buyer_intro`.
- Buyer intro CTA field must remain `metadata.applicationLink`.
- Internal originator intake links must remain separate from buyer portal links.
- The generic fallback `/client-access/bond-application` is a temporary safety net, not the desired production destination.
