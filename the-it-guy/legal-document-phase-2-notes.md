# Legal Document Builder — Phase 2 Notes

## Objective Completed
Implemented a reusable Legal Document Workspace shell and wired Phase 1 Mandate/OTP actions to open this workspace in mode-aware states (`generate`, `edit`, `view`, `send`, `signed`).

## Workspace Component
- New component:
  - `src/components/documents/LegalDocumentWorkspace.jsx`
- Implemented as a full-screen modal shell (three-zone layout):
  - Header: document type, transaction reference, status badge, last-updated, close, primary action
  - Left panel: outline, merge checklist, signer checklist
  - Center panel: preview-first area with loading/empty/error/generated-preview states
  - Right panel: actions, validation, version history, audit events, template summary

## How Buttons Open Workspace
- `src/pages/agency/AgencyPipelinePage.jsx`
  - Seller mandate primary action now opens `LegalDocumentWorkspace` instead of directly executing action.
  - Mode selection is derived from Phase 1 action key:
    - generate/edit/send/view/signed
  - Existing generation/send logic reused through workspace callbacks (`onGenerate`, `onSend`, `onEdit`, `onView`, `onViewSigned`).

- `src/pages/UnitDetail.jsx`
  - OTP primary action now opens `LegalDocumentWorkspace` with mode from Phase 1 action key.
  - Existing OTP operations reused via workspace callbacks:
    - generate (opens existing OTP generation modal)
    - send (existing release-to-client flow)
    - view/view signed (existing preview/open behavior)

## Data Loaded in Workspace
- Uses existing packet architecture and Phase 1 resolver:
  - `resolveDocumentPacketStatus(...)`
  - `resolveDocumentPacketActionState(...)`
  - `fetchDocumentPacket(...)` with versions/events
  - `fetchDocumentPacketTemplate(...)` for template snapshot context
- No parallel packet system introduced.

## Placeholder Areas (Future Phases)
- Editing toolbar and inline legal editing are intentionally placeholder-only in center preview panel.
- Action set is shell-safe and status-aware but does not introduce new editing/generation logic.
- Version/audit surfaces are present and ready for richer Phase 3+ wiring.

## Error / Empty State Coverage Added
- No packet found
- Packet found with no version
- Missing template link/path
- Missing preview URL
- Packet/status lookup failures
- No signer records
- No events
- All failures degrade to non-crashing UI states

## Files Changed
- `src/components/documents/LegalDocumentWorkspace.jsx` (new)
- `src/pages/agency/AgencyPipelinePage.jsx`
- `src/pages/UnitDetail.jsx`

## Known Gaps
- Full online drafting/editing is intentionally deferred to later phases.
- Phase 2 keeps existing generate/send flows intact and invoked via callbacks from the workspace.
- `UnitDetail.jsx` still has pre-existing `no-unused-vars` lint debt unrelated to this phase.

## Build / Lint
- Build:
  - `npm run build` ✅ PASS
  - Existing CSS minify warning remains (`Expected identifier but found "-"`) from existing stylesheet output.
- Targeted lint (Phase 2 files except existing UnitDetail debt):
  - `npx eslint src/components/documents/LegalDocumentWorkspace.jsx src/pages/agency/AgencyPipelinePage.jsx src/core/documents/packetStatusResolver.js` ✅ PASS
- `UnitDetail.jsx` lint:
  - `npx eslint src/pages/UnitDetail.jsx` ❌ FAIL (pre-existing unused vars in file, not introduced by this workspace shell implementation)
