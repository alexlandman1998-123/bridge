# Seller Process Phase 9 Panel Action Routing

Date: 2026-08-06

## Purpose

Phase 9 lets the Kingston seller process panel route agents to existing seller
workspace surfaces.

It does not add a new workflow engine and does not write process state directly.

## Routed Actions

The panel action cards route as follows:

- `schedule_valuation_appointment` opens the existing seller appointment
  composer with `seller_valuation` selected
- `schedule_valuation_presentation` opens the existing seller appointment
  composer with `valuation_presentation` selected
- `upload_valuation_document` opens the existing seller document center
- `complete_seller_pack` opens the existing mandate workspace
- `prepare_listing` opens the existing listing workspace

## Non-Spillover Contract

Phase 9 preserves these guarantees:

- the Kingston panel still renders only from the explicit profile-gated shadow
  payload
- the panel does not create appointments, upload documents, generate mandates,
  update listings, send notifications, or trigger partner handoffs directly
- valuation appointment saves still go through the existing
  `SellerAppointmentForm` submit path
- default organisations still receive no visible seller process panel
- partner services still do not consume internal Kingston workflow keys

## Verification

Run:

```bash
npm run test:seller-process-panel-action-routing-phase9
npm run test:seller-process-workspace-panel-phase8
npm run test:seller-process-panel-model-phase7
npm run test:agent-leads-workspace
```
