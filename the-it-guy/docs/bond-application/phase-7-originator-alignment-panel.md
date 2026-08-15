# Phase 7 - Originator Alignment Panel

## Purpose

Phase 7 surfaces the Phase 6 field-alignment projection inside the bond-originator application workspace. Originators can now see whether buyer portal answers are available in the originator view before acting on the application.

## Contract

The bond-originator application tab shows:

- `Buyer Portal Field Alignment`
- Matched field count from `originatorFieldAlignment.capturedCount`
- Total tracked field count from `originatorFieldAlignment.totalCount`
- Section-level captured/missing coverage
- A short `Missing Fields` list when tracked fields are not captured

## Boundary

This phase does not change buyer submission storage, create bank payloads, submit to banks, or mutate originator workflow rows. It only renders the read-only alignment state already exposed by the originator bond application view model.
