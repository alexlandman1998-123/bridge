# Legal Document Builder — Phase 4 Notes

## Current Version + Editable Draft Structure
- Packet versions are stored in `document_packet_versions` and already support:
  - `render_status`
  - `section_manifest_json`
  - `validation_summary_json`
  - placeholder snapshots
  - timestamps + version numbering
- Generated artifacts remain in existing storage fields (`rendered_file_*`, `final_signed_file_*`).
- Existing version history is append-only by version number; no destructive overwrite flow is required.
- Reuse approach for Phase 4:
  - Keep packet + version architecture intact.
  - Store editable draft structure inside `validation_summary_json.editable_draft`.
  - Store clause content snapshot in `section_manifest_json` for each saved draft version.

## Editable Draft Structure (Implemented)
- File: `src/components/documents/LegalDocumentWorkspace.jsx`
- Added a structured editable model in workspace state:
  - `editableSections[]` (section key, label, required, content, merge tokens)
  - `draftReviewState` (`draft` / `in_review`)
- Draft sections are hydrated from:
  1. `latestVersion.validation_summary_json.editable_draft.sections` (if present)
  2. fallback `latestVersion.section_manifest_json`
  3. generated defaults using placeholder token definitions

## Merge Field Protection Approach
- Merge tokens are parsed with strict token syntax: `{{token_key}}`.
- Editor shows token chips per section (click-to-insert).
- Validation checks before save:
  - malformed token syntax (`{{` / `}}` mismatch)
  - required section empty
  - required merge token removed from clause
  - optional token warnings
- Save is blocked when critical blockers exist.

## Save / Version Lifecycle (Implemented)
- `Save Draft` in edit mode now:
  - creates a new packet version via `createDocumentPacketVersion(...)` with `render_status: 'draft'`
  - writes editable snapshot to `validation_summary_json.editable_draft`
  - persists clause content into `section_manifest_json`
  - updates packet source context (`editableDraftLastSavedAt`, review state, version)
  - appends packet event (`draft_edited` / `draft_marked_in_review`)
- No overwrite of finalized/signed documents.
- Edit mode remains locked unless status is editable.

## Status Locking Rules
- Editing enabled only when resolver state is:
  - `DRAFT`
  - `IN_REVIEW`
- Editing blocked for:
  - `APPROVED`
  - `SENT`
  - `PARTIALLY_SIGNED`
  - `SIGNED`
  - `ARCHIVED`
  - `VOIDED`
- Resolver updates:
  - Added `IN_REVIEW` lifecycle detection from version metadata.
  - `IN_REVIEW` maps to `Edit` action state.

## Preview Synchronization
- Added live draft preview rendering from editable sections (`srcDoc` iframe).
- Preview auto-refreshes when sections change and after save/refresh cycle.
- Existing generated/signed artifact preview remains primary when URLs exist.

## Version History Improvements
- Version history now surfaces review state (`draft` / `in_review`) from version metadata.
- Keeps timestamps and version numbers visible.
- Audit event list remains available for action traceability.

## Files Changed
- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/core/documents/packetStatusResolver.js`

## Build Result
- `npm run build` ✅ PASS
- Existing non-blocking warnings still present:
  - CSS minify warning (`Expected identifier but found "-"`)
  - large chunk warning from Vite

## Targeted Lint Result
- `npx eslint src/components/documents/LegalDocumentWorkspace.jsx src/core/documents/packetStatusResolver.js` ✅ PASS
- Project still has pre-existing lint debt in `src/pages/UnitDetail.jsx` unrelated to this Phase 4 patch.

## Known Limitations
- This is controlled structured editing, not full DOCX WYSIWYG editing.
- Diff/compare and restore-to-previous-version are not fully implemented yet.
- Final render parity to DOCX remains governed by existing generation/signing pipeline (intentionally unchanged in this phase).
