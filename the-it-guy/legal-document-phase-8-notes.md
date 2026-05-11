# Legal Document Builder — Phase 8 Notes

## Current Template Library Architecture
- Existing template foundation reused (no parallel system created):
  - `document_packet_templates`
  - `document_template_sections`
  - `document_placeholder_registry`
- Existing packet/generation architecture preserved:
  - packet versioning
  - DOCX generation
  - signing workflows
- Existing APIs extended, not replaced.

## Phase 8 Implementation Summary
- Upgraded Settings page into a full **Legal Templates** management experience.
- Added a structured **Template Library** view with:
  - template label/name
  - packet/document type
  - version tag
  - lifecycle status badge
  - default/active markers
  - scope (global vs organisation)
  - updated timestamp
- Added **Template Workspace** capabilities:
  - metadata editing
  - lifecycle state controls (`draft`, `in_review`, `approved`, `active`, `deprecated`, `archived`)
  - DOCX storage path/bucket/file controls
  - section management (key/label/type/order/legal text/placeholder keys)
  - clone global template into org-owned editable copy
  - create next version from existing template
  - enforce one default org template per packet type
- Added **DOCX upload flow**:
  - uploads to storage under `legal-templates/{organisationId}/{packetType}/{templateKey}/...`
  - supports `.docx` only
  - returns bucket/path/url metadata and pre-fills form for save
- Added **merge-field governance**:
  - list placeholder registry definitions per packet type
  - toggle required/active flags
  - add new placeholder definitions
- Added **template validation system**:
  - required label/version/sections checks
  - duplicate section key detection
  - malformed placeholder token detection
  - required placeholder coverage warnings
  - unregistered merge-field warnings
- Added **test generation flow** using safe sample context:
  - runs preview generation without touching live transaction records
  - surfaces critical/warning results in UI
  - renders generated preview HTML in-page

## Template Upload Flow
1. Open template workspace for an organisation-owned template.
2. Upload `.docx` in the DOCX Upload block.
3. Bucket/path/file metadata is populated in form.
4. Save template version to persist storage path metadata.

## Merge-Field Governance
- Placeholder definitions are now manageable from the template page.
- Required/active controls feed packet validation expectations.
- Template clause placeholder usage is checked against registry.

## Versioning Strategy
- New version action clones selected template into a new template record.
- Existing packet/template links remain unchanged.
- New generation uses active/default template selection.
- No destructive updates to historical templates.

## Activation Logic
- Status and active/default flags can be managed on org-owned templates.
- "Set As Default" ensures a single org default per packet type.

## Validation System
- Blockers:
  - missing label/version
  - no sections
  - duplicate section keys
  - malformed placeholders
- Warnings:
  - missing storage path
  - required registry placeholders missing from template
  - unregistered placeholders present in clause content

## Permissions Approach
- Reused existing organisation settings permission model.
- Edit actions gated to Principal/Super Admin/Admin contexts.
- Global templates remain read-only; org copy required before edits.

## Route and Navigation Updates
- Settings nav/card renamed from **Signing Templates** to **Legal Templates**.
- Added route alias:
  - `/settings/legal-templates` (primary)
  - `/settings/signing-templates` (backward compatible)

## Files Changed
- `src/pages/settings/SettingsSigningTemplatesPage.jsx`
- `src/lib/documentPacketsApi.js`
- `src/pages/settings/SettingsLayout.jsx`
- `src/pages/settings/SettingsLanding.jsx`
- `src/App.jsx`
- `legal-document-phase-8-notes.md`

## Build / Lint
- Targeted lint:
  - `npx eslint src/pages/settings/SettingsSigningTemplatesPage.jsx src/lib/documentPacketsApi.js src/pages/settings/SettingsLayout.jsx src/pages/settings/SettingsLanding.jsx src/App.jsx`
  - Result: **PASS**
- Build:
  - `npm run build`
  - Result: **PASS**
  - Existing non-blocking warnings remain:
    - CSS minify warning (`Expected identifier but found "-"` from existing stylesheet content)
    - bundle chunk-size warning

## Known Limitations / Follow-up
- DOCX placeholder auto-extraction is not yet server-parsed at upload time; this phase validates placeholders from section content + configured placeholder keys.
- Template review/approval roles are represented by lifecycle status and permission gating, but formal reviewer workflow enforcement can be deepened in a follow-up phase.
- Test generation preview uses sample data context and does not execute live transaction writes.
