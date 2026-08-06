# Seller Process Phase 5 Shadow Integration

Date: 2026-08-06

## Purpose

Phase 5 packages the Phase 4 projections into read-only surface payloads for the
seller process areas that will eventually need Kingston support.

It still does not wire those payloads into live app surfaces.

## Shadow Integration Service

`src/services/sellerProcessShadowIntegrationService.js` exposes:

- `buildSellerProcessShadowIntegration`
- `listSellerProcessShadowIntegrationSurfaceKeys`

The integration bundle covers:

- seller lead workspace
- mandate flow
- listing workspace
- seller document centre
- appointments
- activity timeline
- notifications
- reporting dashboard
- partners

Every payload is explicitly marked:

- `readOnly: true`
- `shadowOnly: true`
- `canWrite: false`
- `canMutate: false`
- `canReplaceJourney: false`
- `canApplyToRuntime: false`

Every live patch remains null:

- `journeyPatch: null`
- `readinessPatch: null`
- `listingPatch: null`
- `documentRequestPatch: null`
- `activityPatch: null`
- `notificationPatch: null`
- `dashboardPatch: null`
- `partnerPatch: null`

## Surface Boundaries

The seller lead workspace payload may show internal Kingston process progress
for future agent-facing panels.

Mandate flow receives seller pack evidence status, but cannot mark mandate
signed or finalize a listing.

Listing workspace receives shadow process percent, but cannot activate or
publish a listing.

Seller document centre and appointments receive missing evidence keys, but no
upload requests or automatic appointment drafts.

Activity timeline receives shadow event descriptors only, with
`canWriteTimeline: false`.

Notifications always return `shouldSend: false` and `shouldQueue: false`.

Reporting dashboard remains `internalOnly: true` and is not wired into the live
dashboard.

Partner payloads continue to hide internal Kingston process keys.

## Non-Spillover Contract

Phase 5 preserves these guarantees:

- default organisations still receive default shadow payloads
- organisation name alone does not activate Kingstons
- Kingston payloads stay in `shadow` mode
- no live seller surface imports the shadow integration service
- no payload can mutate journey, readiness, listing, document, activity,
  notification, dashboard, or partner state
- partner payloads do not expose Kingston internal workflow keys

## Verification

Run:

```bash
npm run test:seller-process-shadow-integration-phase5
npm run test:seller-process-projection-phase4
npm run test:seller-process-evaluator-phase3
npm run test:seller-process-definition-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
