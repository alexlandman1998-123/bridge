# Buyer-Side Launch Hardening Phase 4

Implemented on 2026-07-11.

## Goal

Implement the buyer-side token delivery and invalid-token handling gate for the launch journey from buyer lead to registration.

Phase 4 verifies that buyer token links are not only renderable, but also deliverable, auditable, and operationally visible. It covers buyer onboarding email, buyer portal email, buyer offer email, SMS/WhatsApp token delivery evidence, malformed token denial, inactive/reused token denial, expired offer-token evidence, and already-submitted onboarding behavior.

## Commands

Local contract verification:

```bash
npm run verify:buyer-side-phase4-token-delivery
```

Static-only preflight:

```bash
node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --static-only
```

Strict live staging delivery evidence:

```bash
node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --live --confirm-staging --require-live
```

## Delivery Evidence Matrix

| Evidence | Source | Required live proof |
| --- | --- | --- |
| Buyer onboarding email | `send-email` type `client_onboarding` | `communication_deliveries` row is `sent` or `delivered`, channel `email`, linked to the configured transaction. |
| Buyer portal email | `send-email` type `client_portal_link` | `communication_deliveries` row is `sent` or `delivered`, channel `email`, linked to the configured transaction. |
| Buyer offer email | `send-email` type `buyer_offer_link`, `offer_link`, or `post_viewing_offer_link` | `communication_deliveries` row is `sent` or `delivered`, channel `email`, linked to the offer, portal session, or token metadata where available. |
| Buyer token SMS/WhatsApp | `communication_deliveries` channel `sms` or `whatsapp` | Row is `sent` or `delivered` and linked to the configured buyer lead, transaction, offer, portal session, or token metadata. |
| Operational visibility | Agent lead workspace | Failed offer/onboarding delivery states remain visible to operations. |

## Token-State Matrix

| Token state | Evidence |
| --- | --- |
| Active onboarding token | `transaction_onboarding.token` resolves to the configured transaction with `is_active = true`. |
| Already-submitted onboarding token | `transaction_onboarding.token` resolves with `status = Submitted` or `submitted_at` populated. |
| Reused onboarding token | Previous onboarding token exists with `is_active = false` and must fail public resolution. |
| Active portal token | `client_portal_links.token` resolves to the configured transaction with `is_active = true`. |
| Inactive/reused portal token | Previous portal token exists with `is_active = false` and must fail public resolution. |
| Expired offer token | `offers.offer_token` resolves with `status = expired` or an expiry date in the past. |
| Malformed token | Configured malformed token resolves on no buyer public token table. |

## Live Evidence Contract

Real values must live in `.env.staging.local` or managed deployment secrets. `.env.example` only contains empty placeholders.

Required strict-live delivery evidence:

- `BUYER_SIDE_LAUNCH_BASE_URL`
- `BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BUYER_SIDE_STAGING_TRANSACTION_ID`
- `BUYER_SIDE_STAGING_BUYER_LEAD_ID`
- `BUYER_SIDE_STAGING_OFFER_ID`
- `BUYER_SIDE_STAGING_ONBOARDING_TOKEN`
- `BUYER_SIDE_STAGING_PORTAL_TOKEN`
- `BUYER_SIDE_STAGING_OFFER_TOKEN`
- `BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN`
- `BUYER_SIDE_STAGING_EXPIRED_OFFER_TOKEN`
- `BUYER_SIDE_STAGING_ONBOARDING_DELIVERY_ID`
- `BUYER_SIDE_STAGING_PORTAL_DELIVERY_ID`
- `BUYER_SIDE_STAGING_OFFER_DELIVERY_ID`
- `BUYER_SIDE_STAGING_TOKEN_SMS_DELIVERY_ID`
- `BUYER_SIDE_STAGING_ALREADY_SUBMITTED_ONBOARDING_TOKEN`
- `BUYER_SIDE_STAGING_INACTIVE_PORTAL_TOKEN`

Recommended additional token-state evidence:

- `BUYER_SIDE_STAGING_REUSED_ONBOARDING_TOKEN`
- `BUYER_SIDE_STAGING_REUSED_PORTAL_TOKEN`
- `BUYER_SIDE_STAGING_MALFORMED_TOKEN`

## Static Contracts

Phase 4 gates these contracts before live evidence:

- `send-email` routes buyer onboarding, buyer portal link, and buyer offer link email types.
- Buyer onboarding, portal-link, and offer-link email handlers prepare, mark, and return `deliveryId` evidence.
- `communication_deliveries` supports transaction, offer, portal-session, retry, metadata, opened, email, SMS, and WhatsApp evidence.
- Agent lead workspace reads `communicationDeliveries` and surfaces failed buyer offer/onboarding delivery states.
- Onboarding token resolution requires active `transaction_onboarding` rows.
- Portal token resolution requires active `client_portal_links` rows.
- Public onboarding and portal screens render safe invalid-token states.

## Acceptance

- [x] Phase 4 harness is implemented.
- [x] Phase 4 package command is exposed.
- [x] Phase 4 static delivery, schema, route, and service contracts are gated.
- [x] Phase 4 reuses Phase 3 as a prerequisite.
- [x] Phase 4 live command is read-only and staging-confirmed.
- [ ] Buyer onboarding, portal, offer, and SMS/WhatsApp delivery rows are supplied.
- [ ] Active, expired, inactive/reused, malformed, and already-submitted token states are supplied.
- [ ] Live staging delivery evidence passes with `READY_LIVE` or `READY_LIVE_WITH_WARNINGS`.

## Current Result

2026-07-11 local contract result: `READY_LOCAL_CONTRACT`.

- Static checks: 15 passed, 0 blocked.
- Local prerequisite commands: 1 passed, 0 blocked.
- Command run: `npm run verify:buyer-side-phase4-token-delivery`

2026-07-11 static preflight result: `READY_STATIC_ONLY`.

- Command run: `node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --static-only`

2026-07-11 strict live result: `BLOCKED` as expected until live delivery and token-state fixtures are supplied.

- Command run: `node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --live --confirm-staging --require-live --skip-prerequisites`
- Blocking configuration still required:
  - `BUYER_SIDE_LAUNCH_BASE_URL`
  - `BUYER_SIDE_STAGING_TRANSACTION_ID`
  - `BUYER_SIDE_STAGING_BUYER_LEAD_ID`
  - `BUYER_SIDE_STAGING_OFFER_ID`
  - `BUYER_SIDE_STAGING_ONBOARDING_TOKEN`
  - `BUYER_SIDE_STAGING_PORTAL_TOKEN`
  - `BUYER_SIDE_STAGING_OFFER_TOKEN`
  - `BUYER_SIDE_STAGING_OFFER_SESSION_TOKEN`
  - `BUYER_SIDE_STAGING_ONBOARDING_DELIVERY_ID`
  - `BUYER_SIDE_STAGING_PORTAL_DELIVERY_ID`
  - `BUYER_SIDE_STAGING_OFFER_DELIVERY_ID`
  - `BUYER_SIDE_STAGING_TOKEN_SMS_DELIVERY_ID`
  - `BUYER_SIDE_STAGING_ALREADY_SUBMITTED_ONBOARDING_TOKEN`
  - `BUYER_SIDE_STAGING_INACTIVE_PORTAL_TOKEN`

Live staging delivery evidence is still required because real delivery row IDs and token-state fixtures are not stored in the repository.

## Phase 4 Decision

Decision: PHASE 4 HARNESS IMPLEMENTED; LIVE DELIVERY EVIDENCE REQUIRED.
