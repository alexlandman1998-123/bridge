# Seller Process Phase 5 Valuation Document Action

Date: 2026-08-06

## Purpose

Phase 5 makes the Kingston rail Formal Valuation stage route to the existing
seller document center.

This remains a workspace navigation action. It does not upload a file directly
from the rail and does not mark valuation evidence complete.

## Routed Action

The Kingston rail now routes:

- `Formal Valuation` to `upload_valuation_document`

That action key reuses the existing seller workspace handler and opens the existing seller document center with a `valuation_document` intent. The document tab uses that intent to focus the property document category and search for `Formal Valuation Document`.

## Isolation Rules

- default/non-Kingston seller leads still render the default `SellerJourneyRail`
- Kingston activation still requires explicit `kingstons_residential`
- organisation name and branding still do not activate this behaviour
- Seller Pack remains deferred
- List Property remains non-clickable from the rail in this phase
- the rail does not call document upload APIs

## Excluded From Phase 5

This phase does not:

- add a new valuation upload form
- upload valuation files directly
- mark `valuation_document_uploaded` manually
- route Seller Pack
- route List Property
- generate mandates, defects forms, or FICA forms
- expose Kingston stages to partner surfaces

## Verification

Run:

```bash
npm run test:seller-process-rail-valuation-document-action-phase5
npm run test:seller-process-rail-appointment-actions-phase4
npm run test:seller-process-rail-ui-phase3
npm run test:seller-process-rail-model-phase2
```
