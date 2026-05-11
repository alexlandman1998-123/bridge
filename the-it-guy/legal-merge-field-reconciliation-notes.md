# Legal Merge Field Reconciliation Notes

## Current Merge Field Mismatch Audit

Audited sources:
- Buyer onboarding: `onboarding_form_data` / buyer onboarding payload passed into OTP generation.
- Seller onboarding: seller lead onboarding payload under `lead.sellerOnboarding.formData`.
- Transaction data: transaction, unit, buyer, lead, mandate draft, commission, attorney/conveyancer context.
- Packet generation: `src/core/documents/packetWorkflow.js` and `src/core/documents/packetService.js`.
- Placeholder registry: `src/core/documents/mergeFieldRegistry.js` and `document_placeholder_registry` consumers.
- Template validation: `src/pages/settings/SettingsSigningTemplatesPage.jsx`.
- Workspace preview rendering: `src/components/documents/LegalDocumentWorkspace.jsx`.

Findings:
- The canonical registry already existed and used snake_case, but seeded packet sections still referenced dotted legacy fields such as `buyer.display_name`, `seller.display_name`, `transaction.purchase_price`, `property.address`, `mandate.type`, and `commission.gross_commission_amount`.
- OTP and mandate placeholder resolver output also favored dotted legacy keys, which meant validation could mark working legacy fields as deprecated and could obscure the actual canonical contract.
- Template creation examples and template editor placeholders still taught users the old dotted names.
- Branding fields existed in packet branding snapshots and `organisation_branding`, but merge fields used legacy `organisation.name`, `organisation.logo_light_url`, and `bridge.name`.
- Organisation branding already exists through Settings -> Organisation branding uploads, agency onboarding branding, and the `organisation_branding` table. No schema change was required.

## Canonical Naming Structure

Canonical merge fields now use:
- `snake_case`
- explicit entity prefixes
- readable legal-document names
- backward-compatible aliases for existing templates

Examples:
- `buyer_full_name`
- `seller_full_name`
- `purchase_price`
- `finance_type`
- `property_address`
- `mandate_type`
- `asking_price`
- `agent_full_name`
- `organisation_name`
- `organisation_logo_url`
- `bridge_legal_name`

## Alias Strategy

Legacy aliases remain supported through `normalizeMergeFieldPayload()` and `validateTemplateTokensAgainstRegistry()`.

Examples:
- `buyer.display_name` -> `buyer_full_name`
- `buyer.name` -> `buyer_full_name`
- `seller.display_name` -> `seller_full_name`
- `seller.name` -> `seller_full_name`
- `transaction.purchase_price` -> `purchase_price`
- `property.address` -> `property_address`
- `mandate.type` -> `mandate_type`
- `commission.gross_commission_amount` -> `gross_commission_amount`
- `organisation.name` -> `organisation_name`
- `organisation.logo_light_url` -> `organisation_logo_url`
- `bridge.name` -> `bridge_legal_name`

Deprecated fields still resolve for generation. Template validation now presents clearer replacement guidance so templates can be migrated gradually.

## Validation Changes

Changed:
- Seeded OTP and mandate packet sections now use canonical placeholder keys.
- Packet resolver output now emits canonical keys first.
- Template validation messages now show actionable warnings:
  - unknown field with suggested replacement
  - deprecated field with canonical replacement
  - required fields missing from sections
- Signer seed resolution now checks canonical buyer/seller names and emails before legacy aliases.

Generation safety:
- Required section placeholders are still validated before generation.
- Missing required fields become blockers through existing packet validation.
- Legacy fields continue to work through alias expansion.

## Merge Preview Visibility

Updated the Legal Document Workspace merge checklist to show:
- canonical field name
- current resolved value
- source description from the canonical registry
- required/missing state
- deprecated alias warning when a legacy key was resolved
- unmapped-field warning when unknown values are present

## Branding Architecture

Bridge logo assets added:
- `public/brand/bridge_9_dark_background.png`
- `public/brand/bridge_9_white_background.png`

Workspace branding source:
- Primary source: packet branding snapshot / resolved `organisation_branding`.
- Fallback source: Settings organisation and agency onboarding branding.
- Final fallback: initials-based agency mark.

Legal workspace header now shows:
- top-left agency logo or initials plus organisation name
- center document title, transaction reference, status, last updated
- top-right Bridge Legal / Powered by Bridge 9 treatment using the light-background Bridge 9 logo
- primary action controls kept in the header

Future PDF readiness:
- Canonical branding placeholders now exist for `organisation_logo_url`, `organisation_logo_dark_url`, `bridge_legal_logo_light_url`, and `bridge_legal_logo_dark_url`.
- Packet preview branding now supports Bridge 9 logo rendering.
- Full branded PDF generation was not rebuilt in this pass.

## Files Changed

- `public/brand/bridge_9_dark_background.png`
- `public/brand/bridge_9_white_background.png`
- `src/core/documents/mergeFieldRegistry.js`
- `src/core/documents/packetWorkflow.js`
- `src/core/documents/packetService.js`
- `src/lib/documentPacketsApi.js`
- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/pages/LegalDocumentWorkspacePage.jsx`
- `src/pages/settings/SettingsSigningTemplatesPage.jsx`
- `legal-merge-field-reconciliation-notes.md`

## Known Gaps

- Existing database template seed SQL still contains some legacy placeholders for historical seed compatibility. Runtime validation aliases them safely.
- `document_placeholder_registry` rows may still include legacy keys in existing environments. The UI now exposes canonical fields and warnings, but a data migration can be planned separately.
- Final generated PDF letterhead/footer branding remains future-ready rather than fully implemented.

## Verification

Targeted lint: passed.

Command:
`npx eslint src/core/documents/mergeFieldRegistry.js src/core/documents/packetWorkflow.js src/core/documents/packetService.js src/lib/documentPacketsApi.js src/components/documents/LegalDocumentWorkspace.jsx src/pages/LegalDocumentWorkspacePage.jsx src/pages/settings/SettingsSigningTemplatesPage.jsx`

Build: passed.

Command:
`npm run build`

Build warnings:
- Existing CSS minification warning: `Expected identifier but found "-"` near generated CSS input `-: TZ.;`.
- Existing bundle-size warning for the main JS chunk over 500 kB.
