# Phase 8 - Originator Handoff PDF Alignment

## Purpose

Phase 8 carries the buyer portal field-alignment evidence into the downloaded/shared bond application package. The originator workspace panel shows the alignment state live; the PDF handoff now includes the same coverage summary for offline review.

## Contract

`buildBondApplicationPdfHtml` renders:

- `Buyer Portal Field Alignment`
- coverage as matched fields over total tracked originator fields
- section-level captured and missing counts
- `Missing Originator Fields`
- a success row when every tracked buyer portal field is available

## Boundary

This phase does not create bank payloads, submit to banks, mutate originator workflow rows, or change buyer submission storage. It only adds read-only alignment evidence to the originator handoff document.
