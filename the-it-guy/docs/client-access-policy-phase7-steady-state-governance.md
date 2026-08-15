# Client Access Policy Phase 7 Steady-State Governance

Phase 7 closes the buyer and seller portal link rollout into steady-state
governance. Phase 4 defines the release decision, Phase 5 proves the operational
smoke, and Phase 6 proves post-rollout monitoring. Phase 7 is the support
handover and change control boundary for future work.

## Operating Answer

- Buyer Portal: buyer onboarding before OTP globally remains supported.
- Buyer Portal: Agent manual capture remains available globally.
- Buyer Portal: Kingstons signed OTP evidence is required before Kingstons buyer
  portal access.
- Seller Portal: activation requires manual signed mandate evidence, or final
  signed mandate evidence linked to the listing.
- Seller mandate signing links remain retired.

## Support Handover

Support should triage blocked sends by reason code before escalating:

- `buyer_portal_waiting_for_onboarding_or_otp`: complete buyer onboarding,
  capture buyer onboarding manually, or upload signed OTP evidence.
- `buyer_portal_waiting_for_signed_otp`: upload Kingstons signed OTP evidence.
- `seller_portal_invite_requires_signed_mandate`: upload the manual signed
  mandate or link final signed mandate evidence to the listing.
- `seller_mandate_signing_links_retired`: do not resend a mandate signing link;
  upload the signed mandate manually before Seller Portal activation.

Expected blocked outcomes mean the guard is working. Escalate only when a record
that already satisfies the policy remains blocked, or when retired seller mandate
signing creates live delivery artifacts.

## Change Control

Future changes to buyer or seller portal timing must update all relevant
surfaces in one reviewed change:

- `src/core/clientAccess/clientAccessPolicy.js`
- `src/pages/UnitDetail.jsx`
- `src/services/sellerPortalActivationService.js`
- `src/services/privateListingService.js`
- `src/pages/AgentListingDetail.jsx`
- `src/pages/agency/AgencyPipelinePage.jsx`
- `src/pages/LegalDocumentWorkspacePage.jsx`
- `supabase/functions/send-email/handlers/onboardingSubmitted.ts`
- `supabase/functions/send-email/handlers/sellerOnboarding.ts`
- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-mandate-signing-email/index.ts`
- `supabase/functions/legal-document-job-runner/index.ts`
- `supabase/functions/signer-signing-action/index.ts`

Any change that alters those decisions must also update the Phase 1 through Phase
7 verification chain and the matching operator documentation. Reintroducing
seller mandate signing links is not a support workaround; it is a new product
decision and must fail this governance gate until explicitly redesigned.

## Operational Boundary

This phase performs no live email delivery, does not generate portal links, and
does not mutate production data. It does not depend on deprecated Management API
log endpoints; it uses local source, docs, and the existing static reports.

## Verification

Run the governance report directly:

```bash
npm run verify:client-access-policy:governance
```

Run the full chain:

```bash
npm run verify:client-access-policy
```
