# Legal Document Preview Branding Notes

## Scope

Refined the mandate preview/rendering path used by the Legal Document Workspace so the mandate reads as a formal legal document rather than a dashboard-style packet summary. This pass is presentation- and template-structure-only; it does not rebuild packet generation, signing, locking, finalization, or merge-field architecture.

## Files Changed

- `src/core/documents/packetWorkflow.js`
- `src/core/documents/mergeFieldRegistry.js`
- `legal-document-preview-branding-notes.md`

## Typography Changes

- Mandate preview rendering now uses `Helvetica, Arial, sans-serif`.
- The mandate preview uses A4-like proportions, printable margins, formal uppercase section headings, and body text sized for legal-document readability.
- Generic packet preview typography also moves away from rounded SaaS styling by using the same Helvetica/Arial fallback.

## Header Branding

- Formal document header added for mandate preview.
- Top-left uses organisation/agency branding from the existing packet branding flow:
  - `branding.logoLightUrl`
  - fallback to organisation name.
- Top-right uses Bridge branding from the existing static asset flow:
  - `/brand/bridge_9_white_background.png`
  - fallback label: `Powered by Bridge 9`.

## Footer Branding

- Mandate preview now includes a formal footer:
  - agency logo/name bottom-left
  - `Page 1 of 1 (preview)` centered
  - Bridge logo bottom-right
- True final PDF pagination is not calculated in this preview path yet. The preview explicitly notes that final pagination is calculated during document export.

## Introduction Section

- Added canonical merge field:
  - `mandate_introduction_purpose`
- Added default legal wording only as a fallback in the mandate placeholder resolver.
- Supported aliases:
  - `mandate.introduction_purpose`
  - `mandate.purpose`
  - `introduction_purpose`
- This keeps the section editable through the template/merge-field system rather than baking wording into the renderer.

## Mandate Structure Changes

The mandate section manifest now follows a more legal sequence:

1. Introduction and Purpose
2. Parties
3. Property Details
4. Mandate Terms
5. Commission Terms
6. Marketing / Listing Terms
7. Company/Trust authority clauses when applicable
8. Special Conditions
9. Signature Pages

Sections render with legal numbering, labels, paragraphs, and signature lines rather than card-like blocks.

## Merge Field Behavior

- Resolved merge fields render as formal text.
- Missing/unresolved fields still appear in the preview, but with subtle highlight treatment instead of strong dashboard-style warning chips.
- Validation panels remain the primary place to flag missing/unknown/deprecated fields.

## Branding Source / Fallback Approach

- Agency logo source reuses existing organisation/packet branding:
  - `organisation_branding.logo_light_url`
  - agency onboarding branding fallback
  - organisation name fallback
- Bridge logos use existing static frontend assets:
  - `public/brand/bridge_9_white_background.png`
  - `public/brand/bridge_9_dark_background.png`
- No schema changes were introduced for branding.

## PDF / Print Readiness

- Mandate preview now uses A4-like width (`210mm`), print-safe white background, defined margins, section break avoidance, and header/footer structure.
- This prepares the preview markup for future PDF rendering without changing the current generation pipeline.

## Build / Lint Result

- Targeted lint passed:
  - `npx eslint src/core/documents/packetWorkflow.js src/core/documents/mergeFieldRegistry.js`
- Production build passed:
  - `npm run build`
- Existing build warnings remain:
  - CSS minify warning near generated CSS token `-: TZ.;`
  - large bundle/chunk warning.

## Remaining Gaps

- Final exported PDF pagination is still handled outside this preview renderer; preview pagination is illustrative.
- Generated DOCX/PDF template internals were not rebuilt in this pass.
