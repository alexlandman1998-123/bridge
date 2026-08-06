# Seller Process Phase 4 Appointment Actions

Date: 2026-08-06

## Purpose

Phase 4 makes the Kingston rail appointment stages interactive while keeping
the implementation isolated to the Kingston profile.

Only stages with `surface: 'appointments'` can trigger an action from the rail.

## Appointment Routing

The Kingston rail now routes:

- `Schedule Valuation Appointment` to `schedule_valuation_appointment`
- `Valuation Presentation` to `schedule_valuation_presentation`

Those action keys reuse the existing seller workspace handler:

- `schedule_valuation_appointment` opens the seller appointment composer with
  `seller_valuation`
- `schedule_valuation_presentation` opens the seller appointment composer with
  `valuation_presentation`

The rail does not create appointments directly. Appointment creation still goes
through the existing `SellerAppointmentForm`, validation, linked workflow, and
save path.

## Isolation Rules

- default/non-Kingston seller leads still render the default `SellerJourneyRail`
- Kingston activation still requires explicit `kingstons_residential`
- organisation name and branding still do not activate this behaviour
- non-appointment Kingston rail stages remain non-clickable in this phase

## Excluded From Phase 4

This phase does not:

- route Formal Valuation document upload from the rail
- route Seller Pack
- route List Property
- generate mandates
- upload documents
- mutate listings
- expose Kingston stages to partner surfaces

## Verification

Run:

```bash
npm run test:seller-process-rail-appointment-actions-phase4
npm run test:seller-process-rail-ui-phase3
npm run test:seller-process-rail-model-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
