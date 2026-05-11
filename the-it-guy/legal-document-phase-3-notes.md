# Legal Document Builder — Phase 3 Notes

## Existing Generation Service Path
- `src/pages/agency/AgencyPipelinePage.jsx`
  - Mandate generation entrypoint is `handleGenerateMandateFromSellerLead`.
  - Uses existing packet stack:
    - template discovery: `listPacketTemplates(...)`
    - packet lookup/create: `listDocumentPackets(...)`, `createDocumentPacket(...)`
    - version generation: `generatePacketVersion(...)`
    - status refresh: `resolveDocumentPacketStatus(...)` + `reloadRecords(...)`
- `src/pages/UnitDetail.jsx`
  - OTP generation entrypoint is `handleGenerateOtpDraft`.
  - Uses existing packet stack:
    - template discovery: `listPacketTemplates(...)`
    - packet lookup/create: `listDocumentPackets(...)`, `createDocumentPacket(...)`
    - version generation: `generatePacketVersion(...)`
    - status refresh: `resolveDocumentPacketStatus(...)` + `loadDetail(...)`
- `src/core/documents/packetStatusResolver.js`
  - Normalizes packet lifecycle state from existing packet/version/signer records.
  - Updated to map generated states to `DRAFT` and signing prep to `APPROVED`.

## Phase 3 Wiring Implemented

### 1) Generate Draft is now wired inside Legal Document Workspace
- `src/components/documents/LegalDocumentWorkspace.jsx`
  - Primary action calls the passed generation action with progress hooks.
  - Added in-workspace progress UI for generation stages.
  - Added success feedback after completion.
  - Added shared refresh routine (`refreshWorkspaceData`) to reload:
    - packet status
    - latest versions
    - packet detail/events

### 2) Mandate generate flow integrated
- `src/pages/agency/AgencyPipelinePage.jsx`
  - `handleGenerateMandateFromSellerLead({ onProgress })` now supports progress callbacks.
  - Added create-or-locate behavior before packet version generation.
  - Added safety guard preventing regenerate when packet is already sent/signed/archived.
  - Returns successful completion to workspace and throws on blockers/errors.

### 3) OTP generate flow integrated
- `src/pages/UnitDetail.jsx`
  - `handleGenerateOtpDraft({ specialConditions, onProgress })` now uses packet create-or-locate + `generatePacketVersion` path.
  - Added safety guard preventing regenerate when packet is already sent/signed/archived.
  - Added `handleWorkspaceGenerateOtp({ onProgress })` so workspace `Generate Draft` action performs real generation.
  - `LegalDocumentWorkspace` `onGenerate` is now bound to the real generation function, not the old modal opener.

## Packet Creation / Location Rules
- Lookup existing packet first (scoped by organisation + packet type + transaction/lead context).
- Create packet only when none exists.
- Do not regenerate silently for sent/signed/archived lifecycle states.

## Preview Selection / Fallback Behavior
- `LegalDocumentWorkspace` preview priority:
  1. signed preview URL
  2. generated draft preview URL
  3. fallback message if version exists without preview URL
  4. fallback message for missing packet/version
- Validation panel now surfaces:
  - missing packet
  - missing template link
  - missing version
  - missing preview URL
  - resolver warnings

## Status and Button-State Updates
- Lifecycle mapping adjusted so generated versions resolve to `DRAFT`.
- This drives outside action labels from `Generate` to `Edit` after successful draft creation (Phase 1 mapping).
- Workspace header badge/action refresh after generation completes.

## Error Handling Added/Improved
- Friendly blockers for:
  - missing seller/property data
  - unsupported generation context
  - sent/signed packet regenerate attempts
  - missing template
- Workspace captures generation errors and shows recoverable error state (no blank panel / stuck loader).

## Files Changed
- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/core/documents/packetStatusResolver.js`
- `src/pages/agency/AgencyPipelinePage.jsx`
- `src/pages/UnitDetail.jsx`

## Build Result
- `npm run build` ✅ PASS
- Existing non-blocking warnings remain:
  - CSS minify warning (`Expected identifier but found "-"` in compiled CSS)
  - large chunk warning from Vite

## Targeted Lint Result
- `npx eslint src/core/documents/packetStatusResolver.js src/components/documents/LegalDocumentWorkspace.jsx src/pages/agency/AgencyPipelinePage.jsx` ✅ PASS
- `src/pages/UnitDetail.jsx` still has pre-existing `no-unused-vars` errors unrelated to this phase’s generation wiring and not introduced by this patch.

## Known Gaps (Deferred)
- Full rich text legal editing is not implemented yet (Phase 4).
- Final send/sign orchestration remains existing behavior and will be expanded in later phases.
- Old OTP modal shell still exists for fallback/manual workflow and can be removed in a later cleanup pass once workspace-only flow is fully adopted.
