# Legal Document Full-Page Workspace Notes

## Current Modal Implementation

- Current component: `src/components/documents/LegalDocumentWorkspace.jsx`.
- Current modal callers:
  - `src/pages/UnitDetail.jsx` for OTP packets.
  - `src/pages/agency/AgencyPipelinePage.jsx` for seller mandate packets.
- Current props:
  - `open`, `onClose`
  - `transactionId`, `transactionReference`
  - `packetType`, `packetId`, `mode`, `initialStatus`, `organisationId`
  - lifecycle callbacks: `onGenerate`, `onEdit`, `onSend`, `onView`, `onViewSigned`, `onRefreshContext`
- Current open/close logic:
  - OTP used `legalWorkspaceOpen` and `legalWorkspaceMode` local state in `UnitDetail.jsx`.
  - Mandate used `legalWorkspaceOpen` and `legalWorkspaceMode` local state in `AgencyPipelinePage.jsx`.
  - Close was a modal X button calling `setLegalWorkspaceOpen(false)`.
- Current packet type handling:
  - OTP passes `packetType="otp"` from the unit transaction workspace.
  - Mandate passes `packetType="mandate"` from the agency lead workspace.
- Current transaction/lead handling:
  - OTP is transaction scoped through `transaction.id`.
  - Mandate is primarily lead scoped and may not always have a linked transaction; packet lookup uses `mandatePacketId` and lead context.
- Current mode handling:
  - Button action state is resolved through `resolveDocumentPacketActionState`.
  - Action keys map to workspace modes: `generate`, `edit`, `send`, `view`, `signed`.
- Local state that must survive route navigation:
  - Packet lifecycle state is not dependent on hidden modal state; it reloads through `resolveDocumentPacketStatus`.
  - Editable sections, signer draft rows, feedback, and tab state remain component-local and reload from latest packet/version data.
  - OTP special conditions still live in `UnitDetail.jsx`; full-page route generation uses transaction context and does not depend on the old modal-only special-conditions field.

## Route Added

- Primary route: `/transactions/:transactionId/legal/:packetType`.
- Packet fallback route: `/legal-documents/:packetId`.
- Lead fallback route: `/pipeline/leads/:leadId/legal/:packetType`.

## Route Decision

The primary route follows the requested transaction deep-link shape for OTP and any transaction-linked legal document. A packet-id fallback supports reopening archived/generated packets directly. A lead fallback is included because seller mandates currently originate from agency seller leads before a transaction necessarily exists.

## Modal-To-Page Migration Approach

- `LegalDocumentWorkspace` now accepts `displayMode="page"` and keeps modal mode intact.
- `LegalDocumentWorkspacePage.jsx` supplies route params, query mode, packet id, transaction/lead context, refresh-safe packet status, back navigation, and generic lifecycle callbacks.
- Existing modal state has not been deleted; the visible entry points now navigate to the route.

## Button Navigation Changes

- OTP primary action now navigates to `/transactions/:transactionId/legal/otp?mode=...`.
- OTP review and send buttons navigate to the legal workspace with `mode=view` and `mode=send`.
- OTP action-list send/view/download entries now open the legal workspace instead of directly mutating or opening document URLs.
- Seller mandate primary action now navigates to:
  - `/transactions/:transactionId/legal/mandate?...` when linked to a transaction.
  - `/pipeline/leads/:leadId/legal/mandate?...` when still lead scoped.

## Permission Handling

- Routes are protected with existing `RoleRoute` guards.
- The page wrapper loads transaction context with `fetchTransactionById`; inaccessible transactions fail into a safe error state.
- Packet access remains enforced by existing packet APIs and RLS-aware resolver warnings.
- Workspace mutation buttons still use existing role-derived legal permissions.

## Refresh / Deep-Link Behavior

- Direct refresh reloads transaction context, organisation context, optional lead context, packet status, latest versions, signer summary, and template detail.
- Missing/invalid context shows a clear error with Back and Retry actions.
- Query `mode` guides initial UX; packet status remains resolved from the packet resolver.

## Files Changed

- `src/App.jsx`
- `src/pages/LegalDocumentWorkspacePage.jsx`
- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/pages/UnitDetail.jsx`
- `src/pages/agency/AgencyPipelinePage.jsx`
- `legal-document-fullpage-workspace-notes.md`

## Known Gaps

- Mandate generation from a lead route uses locally available agency lead data. If a historical mandate lacks both packet id and lead context, the page will ask for valid context instead of inventing a packet.
- The full-page wrapper keeps the legacy route-level send notification behavior conservative; signer link generation and lifecycle state remain controlled by the existing workspace engine.

## Build Result

- `npm run build` passed.
- Build still reports the pre-existing CSS minifier warning: `Expected identifier but found "-"` at generated CSS input around `-: TZ.;`.
- Vite chunk-size warning remains present.

## Targeted Lint Result

- `npx eslint src/components/documents/LegalDocumentWorkspace.jsx src/pages/LegalDocumentWorkspacePage.jsx src/pages/UnitDetail.jsx src/pages/agency/AgencyPipelinePage.jsx src/App.jsx` passed.

## Browser Verification

- Started local Vite dev server on `http://127.0.0.1:5173/`.
- Opened `/transactions/not-a-real-transaction/legal/otp?mode=generate` after local dev bypass.
- Confirmed the route renders a full-page legal workspace error state, not a modal overlay.
- Confirmed invalid transaction references are shown as a friendly legal-workspace error, not raw UUID/database syntax.
