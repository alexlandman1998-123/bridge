# Legal Document Builder — Phase 9 Notes

## Scope
Phase 9 implemented merge field governance and a canonical field registry on top of the existing packet/template system.

## Current Placeholder Registry + Merge Field Mapping
- Existing registry table remains primary source for persisted placeholders: `document_placeholder_registry`.
- Existing packet validation and preview flows (`packetWorkflow`, `packetService`) were retained and extended.
- Existing template authoring and preview flow in `SettingsSigningTemplatesPage` was reused.
- No parallel merge engine was added.

## Canonical Field Categories
Implemented canonical categories in `mergeFieldRegistry.js`:
- Buyer Details
- Seller Details
- Property Details
- Transaction Terms
- Agent / Agency
- Developer
- Attorney / Conveyancer
- Signing
- Document Metadata

## Field Metadata Model
Each canonical field now has:
- `key`
- `label`
- `description`
- `category`
- `dataSource`
- `required`
- `packetTypes`
- `sampleValue`
- `validationRule`
- `aliases`

## Source Mapping Strategy
- Canonical resolution now normalizes legacy aliases to canonical keys at runtime.
- Resolver supports normalized DB-style keys and legacy dotted/camel variants.
- New helper `buildCanonicalMergeFieldSourceMap(...)` provides source-aware rows (key/category/source/resolved value/sample) for UI/test/debug consumers.
- Missing values resolve safely without crashing generation UI.

## Validation Behavior
### Template-time validation
- Template tokens are scanned and validated against canonical registry.
- Unknown placeholders are flagged with suggested canonical replacements where available.
- Legacy/deprecated aliases are flagged as warnings.
- Missing required canonical fields for packet type are surfaced.

### Generation-time validation
- Placeholder payload is normalized before section validation.
- Validation now emits:
  - `critical`
  - `warnings`
  - `aliasHits`
  - `unknownFields`
- Validation summary carries canonical diagnostics into packet workflow events and UI summaries.

## Alias + Deprecation Strategy
- Alias map supports drift prevention (for example: `buyerFullName`, `buyer_fullname`, `purchaser_name` -> `buyer_full_name`).
- Legacy alias usage is accepted for compatibility but warned in validation output.
- Unknown tokens receive closest canonical suggestions when possible.

## UI Changes
### Template Workspace (`SettingsSigningTemplatesPage.jsx`)
- Added canonical merge field registry panel with:
  - search
  - category filter
  - required/optional badges
  - sample value
  - mapped-in-registry indicator
  - copy token action
- Template validation summary now includes canonical required-field checks, unknown token warnings, and legacy alias warnings.

### Legal Document Workspace (`LegalDocumentWorkspace.jsx`)
- Merge checklist now uses canonical required fields + normalized payload mapping.
- Checklist status reflects canonical coverage per section group (buyer/seller/property/finance/attorney/agent).

## Permissions
- Template governance/edit remains gated by existing settings permissions (`canManageOrganisationSettings` + membership role checks).
- Non-authorized users can view but cannot mutate template/registry settings.

## Files Changed (Phase 9)
- `src/core/documents/mergeFieldRegistry.js` (new)
- `src/core/documents/packetWorkflow.js`
- `src/core/documents/packetService.js`
- `src/pages/settings/SettingsSigningTemplatesPage.jsx`
- `src/components/documents/LegalDocumentWorkspace.jsx`
- `legal-document-phase-9-notes.md` (new)

## Build + Lint
- Build: `npm run build` ✅
- Targeted lint:
  - `npx eslint src/core/documents/mergeFieldRegistry.js src/core/documents/packetWorkflow.js src/core/documents/packetService.js src/pages/settings/SettingsSigningTemplatesPage.jsx src/components/documents/LegalDocumentWorkspace.jsx` ✅

## Known Limitations / Follow-up
- Canonical source-map rows are implemented as helpers but not yet fully rendered in a dedicated “resolved values + source lineage” table inside the Legal Document Workspace.
- Alias/deprecation warnings are in validation flows; bulk migration tooling for older templates is not part of this phase.
- No schema changes were made in Phase 9.
