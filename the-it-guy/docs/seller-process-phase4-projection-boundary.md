# Seller Process Phase 4 Projection Boundary

Date: 2026-08-06

## Purpose

Phase 4 turns the Phase 3 evaluator output into read-only projections that can
later be consumed by app surfaces deliberately.

It does not wire those projections into seller lead workspace, mandate flow,
listing activation, seller document centre, notifications, reporting dashboards,
appointments, activity timeline, attorney surfaces, or bond originator surfaces.

## Projection Types

`src/services/sellerProcessProjectionService.js` exposes:

- `buildSellerProcessSurfaceProjection`: internal app surface projection
- `buildSellerProcessPartnerProjection`: partner-safe projection for one partner
- `buildSellerProcessProjectionBundle`: internal, reporting, and partner-safe
  projections together

All Phase 4 projections return:

- `readOnly: true`
- `canReplaceJourney: false` for internal surfaces
- `journeyPatch: null`
- `readinessPatch: null`

## Internal Surface Projection

Internal surfaces may see profile process progress, including the current
Kingstons process stage and missing evidence keys. This is intended for future
agent-facing workspace panels, not for replacing the global seller journey.

Because Kingstons remains `runtimeEnabled: false`, its projection mode is
`shadow`.

## Partner-Safe Projection

Partner projections deliberately hide Kingstons internal stage and evidence
names. Attorneys and bond originators receive only:

- readiness state
- blocker count
- blocker source categories
- generic blocker labels

They do not receive `first_contact`, `valuation_presented`,
`seller_pack_signed`, `defects_form_signed`, `fica_pack_signed`, or any other
Kingstons internal workflow key.

## Reporting Projection

Reporting projection is marked `internalOnly: true`. It carries coarse metrics
such as profile, mode, blocker count, and completion percentage.

Reporting projection is not wired into dashboards in Phase 4.

## Non-Spillover Contract

Phase 4 preserves these guarantees:

- default organisations still project as `default`
- organisation name alone does not activate Kingstons
- Kingstons projects as `shadow`, not runtime
- projections cannot replace live journey/readiness state
- partner projections hide internal Kingstons process keys
- live seller journey does not import the projection service
- live seller readiness does not import the projection service
- seller document requirement engine does not import the projection service
- private listing lifecycle does not import the projection service

## Verification

Run:

```bash
npm run test:seller-process-projection-phase4
npm run test:seller-process-evaluator-phase3
npm run test:seller-process-definition-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
