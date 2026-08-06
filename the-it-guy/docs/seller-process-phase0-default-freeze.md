# Seller Process Phase 0 Default Freeze

Date: 2026-08-06

## Purpose

Phase 0 freezes the current default seller process before adding a Kingstons
seller process profile. It is a safety baseline only. It does not introduce
Kingstons runtime behaviour, new gates, new document types, or new appointment
requirements.

The non-Kingstons default must continue to behave exactly as it does today until
an organisation is explicitly assigned a future process profile.

## Current Default Seller Spine

The current default seller journey is:

1. `new_lead`
2. `contacted`
3. `seller_onboarding_sent`
4. `seller_onboarding_submitted`
5. `mandate_sent`
6. `mandate_signed`
7. `listing_created`
8. `listing_live`
9. `documents_submitted`

Source of truth: `src/services/sellerJourneyService.js`.

## Current Default Readiness Behaviour

The default seller readiness behaviour is:

- first action is contact seller
- contacted sellers move to seller onboarding
- completed onboarding moves to mandate generation
- generated/sent mandate moves to signature tracking
- signed mandate moves to create listing
- created listing moves to activate listing
- live listing moves to monitoring/performance

Source of truth: `src/services/sellerReadinessService.js`.

## Current Default Mandate And Listing Behaviour

For the default profile, a completed canonical mandate packet with a final signed
artifact is the non-overridable proof required before the listing can move to
`mandate_signed` or `active`.

When a listing reaches `mandate_signed`, the lifecycle side effects are:

- `mandateStatus = signed`
- `listingVisibility = active_market`
- `isActive = true`
- activity type `mandate_signed`

Source of truth: `src/lib/privateListingLifecycle.js`.

Manual mandate uploads or status-only claims must not replace the completed
canonical mandate packet for lifecycle advancement.

## Current Default Seller Document Behaviour

The default document/readiness path does not include Kingstons-specific evidence
keys such as:

- `valuation_document`
- `valuation_presented`
- `defects_form_signed`
- `fica_pack_signed`

Those can be introduced later as profile-scoped requirements, but Phase 0 keeps
the default requirement engine unchanged.

Source of truth: `src/lib/sellerDocumentRequirementEngine.js` and
`src/services/sellerDocumentRequirementsService.js`.

## Mandate-Signed Touchpoint Inventory

These are the current surfaces that treat mandate signature as a meaningful
default process signal. Future Kingstons work must route changed behaviour
through a central seller process resolver instead of editing each surface with
Kingstons-specific branches.

| Surface | Current default behaviour | Source |
| --- | --- | --- |
| Seller journey | `mandateStatus === signed` derives `mandate_signed`. | `src/services/sellerJourneyService.js` |
| Seller readiness | `mandate_signed` next action is `create_listing`. | `src/services/sellerReadinessService.js` |
| Private listing lifecycle | `mandate_signed` side effects make the listing active-market/live. | `src/lib/privateListingLifecycle.js` |
| Linked listing finalization | legal workspace finalization syncs linked listing to `mandate_signed`, `active_market`, and active. | `src/pages/LegalDocumentWorkspacePage.jsx` |
| Lead/listing stage sync | listing lifecycle `mandate_signed` syncs lead stage to `Mandate Signed`. | `src/services/privateListingService.js` |
| Seller document action hints | `mandate_signed` requires `activate_listing`. | `src/lib/sellerDocumentRequirementEngine.js` |
| Agent data/listing projection | `mandate_signed` maps as a reserved/deposit-facing stage. | `src/lib/agentDataService.js` |
| Seller portal projection | signed mandate and listing status produce seller portal progress states. | `src/services/clientPortalWorkspaceService.js` |
| Post-mandate documents | post-mandate seller document orchestration starts from `mandate_signed`. | `src/services/sellerPostMandateDocumentOrchestrationService.js` |
| Attorney allocation | transfer attorney allocation records the mandate signed timestamp. | `src/services/privateListingAttorneyAllocationService.js` |

## Isolation Requirements For Phase 1+

Future Kingstons work must follow these rules:

- keep default profile output unchanged
- add a profile boundary before adding Kingstons gates
- centralise process decisions in a resolver
- avoid `if Kingstons` checks inside individual surfaces
- expose partner readiness as handoff readiness/blockers, not Kingstons internals
- keep manual upload and digital signature evidence mapped through one document
  requirement model

## Phase 0 Verification

Run:

```bash
npm run test:seller-process-default-freeze-phase0
```

This contract intentionally checks that the default journey, readiness actions,
lifecycle side effects, and document action hints have not been quietly changed
to the Kingstons flow.
