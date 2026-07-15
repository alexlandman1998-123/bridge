# OTP simplification — Phase 3

Phase 3 converts the current Kingstons 2026 Offer to Purchase into the single canonical, generation-ready Word template. It preserves the approved document layout and fixed legal wording while replacing transaction-specific blanks with stable data tokens.

## Deliverables

- `templates/legal/kingstons-2026-otp-canonical-v1.docx` — the canonical 15-page Word template.
- `templates/legal/kingstons-2026-otp-canonical-v1.manifest.json` — the machine-readable mapping between the Phase 1 field contract and Word locations.
- `scripts/prepare-canonical-otp-template.py` — a deterministic OOXML preparation utility.
- `scripts/export-otp-canonical-template-manifest.mjs` — regenerates the manifest from the source contract.

The source document is identified by SHA-256
`a1f8f2e82611f44aead9b2f9ac6fdaa19c8577038b17ca1a6666f2cd4e9910cc`.
The prepared canonical template is identified by SHA-256
`4e7fb4415a7b412dbbfb4fbdc430d62f4146a5eed68a619c3c83d3d685bdd691`.

## Template rules

- The canonical field inventory contains 84 fields and the DOCX contains 118 unique placeholders.
- Repeated purchasers and sellers use explicit, stable numbered keys.
- Dates use South African long-date formatting (`D MMMM YYYY`); signing dates are split into place, day, month and two-digit year slots to match the existing form.
- Money uses ZAR, two decimals and a space as the thousands separator.
- Choice groups use `X` for the selected option and a blank value for unselected options.
- Missing optional values render as blank while retaining the document's existing table and line layout.
- Actual signature, witness and initial boxes remain signing-overlay fields; the Word document only contains the surrounding signing details.

## Legal and layout boundary

Only `word/document.xml` may be changed during preparation. All other DOCX package parts, including headers, footers, images, styles, relationships and custom XML, are preserved byte-for-byte.

The fixed OTP legal core remains part of the standard template. The only transaction-supplied legal-text regions are:

1. Other suspensive conditions.
2. Special conditions.

This phase prepares the artifact and its contract. Runtime data binding belongs to Phase 4; replacing the active production template belongs to a later governed activation phase.

## Verification

Run:

```bash
npm run test:otp-canonical-template-phase3
```

The checks confirm complete field coverage, stable token naming, deterministic formatting and empty-value rules, legal-text boundaries, signing-overlay separation, and presence of every declared placeholder in the canonical DOCX.
