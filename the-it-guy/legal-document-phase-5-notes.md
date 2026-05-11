# Legal Document Builder — Phase 5 Notes

## Current Review / Approval Lifecycle Structure
- Existing packet workflow data already lives in:
  - `document_packets` (packet-level status + context)
  - `document_packet_versions` (draft/version snapshots)
  - `document_packet_events` (timeline/audit trail)
  - `document_packet_signers` (signature progress)
- Existing status hints were previously spread across packet status, signer state, and version metadata.
- Phase 5 consolidates these into one normalized lifecycle model in the UI, while still persisting through the existing packet/event architecture.

## Normalized Lifecycle (Implemented)
- File: `src/components/documents/LegalDocumentWorkspace.jsx`
- Normalized lifecycle states:
  - `DRAFT`
  - `IN_REVIEW`
  - `APPROVED`
  - `LOCKED`
  - `SENT`
  - `PARTIALLY_SIGNED`
  - `SIGNED`
  - `ARCHIVED`
- Packet resolver now maps lifecycle hints from packet + version metadata:
  - File: `src/core/documents/packetStatusResolver.js`
  - Reads `packet.source_context_json.lifecycle_state`
  - Reads `latestVersion.validation_summary_json.review_state`
  - Detects locked/approved/in_review and maps them to normalized states.

## Review / Approval Actions Added
- Workspace action system now adapts by lifecycle state.
- `Draft`:
  - `Save Draft`
  - `Submit for Review`
- `In Review`:
  - `Return to Draft`
  - `Approve Draft`
- `Approved`:
  - `Lock Document`
  - `Send for Signature`
- `Locked`:
  - `Send for Signature`
  - `View Preview`
  - `Download PDF`
- `Sent` / `Partially Signed`:
  - `View Signing Status`
  - `Resend (placeholder)`
  - `View Draft`
- `Signed`:
  - `View Signed PDF`
  - `Download Signed Copy`
  - `View Signing History`

## Document Locking Behavior
- Editing is allowed only in:
  - `Draft`
  - `In Review`
- Editing is blocked in:
  - `Approved`
  - `Locked`
  - `Sent`
  - `Partially Signed`
  - `Signed`
  - `Archived`
- Locking enforcement:
  - status transition validation blocks invalid transitions
  - lock/send/signed states force read-only editor behavior
  - generation/edit actions are prevented from silently mutating locked/sent/signed states

## Status Transition Protection
- Transition guard implemented in workspace (`assertLifecycleTransitionAllowed`).
- Allowed transitions:
  - `draft -> in_review`
  - `in_review -> draft | approved`
  - `approved -> locked | sent`
  - `locked -> sent`
- Blocked examples:
  - `signed -> draft`
  - `signed -> edit`
  - `locked -> edit`
  - `sent -> regenerate` (silent/unsafe mutation)
- Invalid transitions show friendly UI feedback and preserve current state.

## Approval + Send Validation Rules
- Before approval/send, lifecycle validation checks:
  - packet exists
  - latest version exists
  - template is present
  - no critical draft validation blockers
  - send only from `approved`/`locked`
- If blocked, the workspace shows clear remediation messages and does not transition state.

## Review Status / Timeline UX
- Added lifecycle visual progress and guidance:
  - current step explanation
  - next step explanation
  - progress bar
  - step chips across the full lifecycle
- Header action labels now adapt to lifecycle context (`Lock Document`, `Send for Signature`, etc.).
- Added “Ready for signature” panel in approved/locked states to shift user focus from editing to sending.

## Version History Expansion
- Version history panel now includes lifecycle events with:
  - action label
  - timestamp
  - actor fallback
- Lifecycle events include:
  - submitted for review
  - returned to draft
  - approved
  - locked
  - sent for signature

## Files Changed
- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/core/documents/packetStatusResolver.js`

## Build Result
- `npm run build` ✅ PASS
- Non-blocking existing warnings observed:
  - CSS minify warning (`Expected identifier but found "-"`)
  - Vite large chunk warning

## Targeted Lint Result
- `npx eslint src/components/documents/LegalDocumentWorkspace.jsx src/core/documents/packetStatusResolver.js` ✅ PASS

## Known Limitations
- Resend flow is still placeholder-only in this phase.
- Full signing-history detail depends on available packet events/signing metadata.
- Backend status persistence remains additive through existing packet context/events (no schema rewrite in this phase).
