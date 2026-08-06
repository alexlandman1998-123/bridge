# Seller Process Phase 3 Kingston Rail UI

Date: 2026-08-06

## Purpose

Phase 3 renders the Kingston rail model in the seller lead workspace for
organisations explicitly configured with `kingstons_residential`.

This phase does not rewrite the global seller journey. It swaps the visible rail
only when the Phase 2 rail model returns `visible: true`.

## UI Behaviour

Kingston sees a six-step rail:

1. First Contact
2. Schedule Valuation Appointment
3. Formal Valuation
4. Valuation Presentation
5. Seller Pack
6. List Property

The rail uses the existing `seller-journey` anchor so current seller status
shortcuts keep working.

## Isolation Rules

- default `SellerJourneyRail` remains the fallback for every non-Kingston lead
- organisation name, logo, email, and branding still do not activate Kingston UI
- `kingstons_residential` is the only activation path
- `AgentLeadsPage` consumes the Phase 2 rail model, not raw organisation names
- Seller Pack remains a deferred visual step

## Functionality Boundary

Phase 3 does not wire rail clicks.

It does not:

- create valuation appointments
- upload valuation documents
- open mandate flows from the rail
- create or activate listings
- mutate lead, listing, document, or partner state

Those interactions are reserved for later appointment/document routing phases.

## Verification

Run:

```bash
npm run test:seller-process-rail-ui-phase3
npm run test:seller-process-rail-model-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
