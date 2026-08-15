# Bond Application Prefill Phase 8: Originator Confirmation Confidence

## Purpose

Phase 8 surfaces the buyer-facing prefill confirmation metadata in the originator workspace and handoff PDF.

The originator can now see which buyer portal sections were explicitly confirmed after the OTP unlock, separately from the existing buyer portal field-alignment coverage. Field alignment answers whether the data is available to the originator model. Confirmation confidence answers whether the buyer actively confirmed the prefilled section.

## Runtime Contract

`buildBondApplicationViewModel` exposes `buyerConfirmationConfidence` and the backwards-compatible alias `confirmationConfidence`.

The object includes:

- `source: buyer_portal_prefill_confirmation_metadata`
- `target: bond_originator_view_model`
- `confirmedCount`
- `totalSupportedSections`
- `percent`
- `confidenceLevel`
- `fieldAlignmentPercent`
- `confirmedSectionKeys`
- `missingSectionKeys`
- `sections`
- `missingSections`
- `lastConfirmedAt`

Each confirmed section carries the stored Phase 7 confidence value, field counts, card keys, and field paths from `prefill_metadata.confirmations.sections`.

## Originator Workspace

`AttorneyTransactionDetail.jsx` renders a `Buyer Section Confirmations` card next to the existing `Buyer Portal Field Alignment` panel.

This keeps the two concepts visible and distinct:

- buyer-confirmed sections
- unconfirmed supported sections
- originator field coverage
- missing originator fields

## Handoff PDF

`buildBondApplicationPdfHtml` includes `Buyer Section Confirmations` and `Unconfirmed Buyer Sections` before the field-alignment section.

The PDF remains a handoff summary only. Phase 8 does not mutate bank payloads, originator submission payloads, or buyer answers.

## Boundary

Phase 8 is read-only against application data. It consumes Phase 7 metadata already persisted under `prefill_metadata.confirmations` and presents that metadata to originator-facing surfaces.
