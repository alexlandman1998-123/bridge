# Seller Process Phase 2 Definition Model

Date: 2026-08-06

## Purpose

Phase 2 defines the Kingstons seller process as profile-scoped data only. It
does not change the live seller journey, readiness service, mandate lifecycle,
listing activation, seller document engine, appointments, partner handoffs,
notifications, or reporting.

The definition lives in `src/services/sellerProcessDefinitionService.js` and is
selected through the Phase 1 resolver.

## Kingstons Process Definition

The Kingstons profile key is `kingstons_residential`.

The Phase 2 process stages are:

1. `first_contact`
2. `valuation_appointment_scheduled`
3. `formal_valuation_completed`
4. `valuation_presentation_scheduled`
5. `valuation_presented`
6. `seller_pack_signed`
7. `listing_ready`

These are not global journey stages yet. Each stage carries a `defaultStageKey`
so Phase 3 can map Kingstons progress back to the existing app surfaces without
leaking new internal states into default organisations.

## Appointment Requirements

Kingstons needs two appointment requirements:

- `valuation_appointment` using appointment type `seller_valuation`
- `valuation_presentation` using appointment type `valuation_presentation`

These are definition-only in Phase 2. The appointment scheduler is not yet
gated by this model.

## Document And Evidence Requirements

Kingstons needs these documents:

- `valuation_document`
- `seller_mandate`
- `defects_disclosure_form`
- `seller_fica_pack`

The evidence gates are:

- `valuation_document_uploaded`
- `valuation_presented`
- `mandate_signed`
- `defects_form_signed`
- `fica_pack_signed`

Mandate, defects, and FICA can later be satisfied either by digital signature or
manual upload. Phase 2 only records the allowed evidence modes; it does not
make manual uploads equivalent to canonical mandate packet completion in the
default lifecycle.

## Partner Boundary

Partner handoffs are modelled as readiness signals only:

- transfer attorney handoff can become ready after `seller_pack_signed`
- bond originator context can become ready after `seller_pack_signed`

The definition explicitly keeps Kingstons internal stages hidden from partners.
Phase 3+ should expose partner readiness/blockers, not the Kingstons workflow
internals.

## Non-Spillover Contract

Phase 2 preserves these guarantees:

- default organisations still resolve to `default_residential`
- default process stages remain the Phase 0 global seller journey stages
- Kingstons stages are not imported by `sellerJourneyService`
- Kingstons requirements are not imported by `sellerReadinessService`
- Kingstons documents are not imported by `sellerDocumentRequirementEngine`
- `kingstons_residential` has `runtimeEnabled: false`

## Verification

Run:

```bash
npm run test:seller-process-definition-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
