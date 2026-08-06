# Seller Process Phase 3 Evaluator Boundary

Date: 2026-08-06

## Purpose

Phase 3 adds a seller process evaluator behind the Phase 1 profile resolver and
Phase 2 definition model.

It can calculate profile-scoped process progress from existing app data:

- activity timeline entries
- appointments
- uploaded documents
- canonical mandate packet status
- listing state

It does not replace the live seller journey, readiness service, seller document
engine, private listing lifecycle, partner handoff surfaces, notifications, or
reports.

## Runtime Lock

`kingstons_residential` remains `runtimeEnabled: false`.

The evaluator returns `canApplyToRuntime: false` for Kingstons until a later
phase deliberately unlocks it. This lets us test Kingston progress calculations
without changing what agents, sellers, attorneys, or bond originators see in the
current app.

## Evidence Mapping

The evaluator satisfies Kingston evidence as follows:

- `seller_contacted`: contact activity or lead contacted signal
- `valuation_appointment_scheduled`: `seller_valuation` appointment scheduled,
  confirmed, awaiting confirmation, or completed
- `valuation_document_uploaded`: `valuation_document` uploaded, under review,
  approved, or completed
- `valuation_presentation_scheduled`: `valuation_presentation` appointment
  scheduled, confirmed, awaiting confirmation, or completed
- `valuation_presented`: `valuation_presentation` appointment completed
- `mandate_signed`: canonical signed mandate packet or mandate document evidence
- `defects_form_signed`: defects disclosure evidence
- `fica_pack_signed`: seller FICA pack evidence
- `listing_ready`: listing row exists with an accepted listing status

Manual mandate evidence may satisfy the Kingston process evaluator, but it still
does not advance the default private listing lifecycle. The canonical lifecycle
guard remains separate.

## Partner Boundary

The evaluator can compute partner readiness from the profile model, but partner
surfaces still receive no Kingstons-specific states in Phase 3. Partner readiness
is a future output contract, not a live integration.

## Non-Spillover Contract

Phase 3 preserves these guarantees:

- default organisations still resolve to the default process
- organisation name alone does not activate Kingstons
- live seller journey does not import the evaluator
- live seller readiness does not import the evaluator
- seller document requirement engine does not import the evaluator
- private listing lifecycle does not import the evaluator
- Kingstons evaluator output remains non-applicable to runtime

## Verification

Run:

```bash
npm run test:seller-process-evaluator-phase3
npm run test:seller-process-definition-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
