# Phase 7 - Buyer Bond Application Confirmation Metadata

## Purpose

Phase 7 persists buyer section confirmations as support metadata. This gives the buyer portal a durable confirmation state and gives originator-facing surfaces a clean confidence signal without treating confirmation metadata as buyer-entered application answers.

## Delivered Behaviour

- Confirmed sections are stored under `prefill_metadata.confirmations`.
- Confirmation metadata uses version `phase-7-v1`.
- Each confirmed section records `confirmedAt`, `updatedAt`, `cardKeys`, `fieldPaths`, `confirmedFields`, `totalFields`, and `confidence`.
- Editing a field clears the active section confirmation from the draft metadata.
- Saving the bond application persists confirmation metadata inside the existing `formData.bond_application` JSON.
- The prefill review model exposes `confirmedSectionKeys`, `confirmedSectionCount`, and `confirmationConfidenceBySection`.

## Boundary

Phase 7 does not create database tables, alter the bond application schema, submit to originators, create bank payloads, or persist confirmation metadata as buyer-entered field data. It remains support metadata inside the existing buyer bond application draft.

## Next Phase

The next phase should surface confirmation confidence in the originator workspace and handoff package so originators can see which buyer-facing sections were explicitly confirmed.
