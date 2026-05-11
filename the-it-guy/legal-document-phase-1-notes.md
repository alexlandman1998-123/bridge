# Legal Document Builder — Phase 1 Notes

## Objective Completed
Implemented packet status detection + normalized button state logic for Mandate/OTP without changing generation/signing architecture.

## 1) Current Generate Button Audit
- `src/pages/agency/AgencyPipelinePage.jsx`
  - Seller lead workspace actions currently include mandate generation/sending.
  - Calls packet services: `createDocumentPacket`, `generatePacketVersion`, `prepareSigningFields`, `generateSigningLinks`.
  - Context passed: `organisationId`, normalized lead id, template snapshot, signer context.
- `src/pages/UnitDetail.jsx`
  - OTP workflow has generate/approve/share/upload flow in sales lane and card actions.
  - Existing OTP draft generation currently uploads OTP HTML document flow; not yet packet-native end-to-end.
- `src/pages/Pipeline.jsx`
  - Legacy seller pipeline path has “Generate/Send Mandate” labels based on local stage.
  - This path is not fully packet-aware yet and remains a known gap for later migration.

## 2) Packet Status Resolver Approach
- Added reusable resolver:
  - `src/core/documents/packetStatusResolver.js`
- Resolver inputs:
  - `packetType` (`mandate` | `otp`)
  - optional `packetId`, `transactionId`, `leadId`, `organisationId`
- Resolver behavior:
  - Looks up packet by id (if present), then fallback list query by transaction/lead scope.
  - Loads versions and signing summary when available.
  - Normalizes lifecycle into:
    - `NO_PACKET`
    - `DRAFT`
    - `APPROVED`
    - `SENT`
    - `PARTIALLY_SIGNED`
    - `SIGNED`
    - `ARCHIVED`
    - `VOIDED`
    - `UNKNOWN`
  - Handles schema-missing/RLS-denied/partial-table failures with warnings and non-crashing fallbacks.

## 3) Normalized UI Status Mapping
- Added normalized action mapping via `resolveDocumentPacketActionState(...)`:
  - `NO_PACKET` → `Generate`
  - `DRAFT` → `Edit`
  - `APPROVED` → `Send`
  - `SENT` / `PARTIALLY_SIGNED` → `View`
  - `SIGNED` → `View Signed`
  - archived/voided/unknown → `Open` fallback

## 4) UI Updates Completed
- `src/pages/agency/AgencyPipelinePage.jsx`
  - Replaced separate mandate action pair in seller lead workspace with one packet-aware primary action.
  - Button now resolves dynamic label/action (`Generate/Edit/Send/View/View Signed Mandate`).
  - Added safe loading state (`Checking…`) and busy handling for generate/send.
  - Added link-safe open fallback for view states.
- `src/pages/UnitDetail.jsx`
  - Added OTP packet status lookup by transaction.
  - Updated OTP action label in workflow/card context to status-aware mapping.
  - Added unified primary handler for `Generate/Edit/Send/View/View Signed OTP` behaviors with safe fallback messaging.

## 5) Fallback / Safety Behavior
- If packet queries fail (RLS/schema/cache/etc):
  - UI does not crash.
  - Resolver returns warning-backed fallback state.
  - Actions continue through safe existing routes where possible.
- If view/signed URL unavailable:
  - Clear user error message shown.
  - No blank screens/infinite loading introduced.

## 6) Known Gaps (Intentional in Phase 1)
- Legacy mandate flow in `src/pages/Pipeline.jsx` still uses stage/local-data-based labels and is not fully packet-driven.
- Full legal workspace UX is intentionally deferred to Phase 2.
- OTP backend remains mixed (existing document flow + packet awareness overlay) until later phases unify end-to-end packet flow.

## 7) Files Changed
- `src/core/documents/packetStatusResolver.js` (new)
- `src/pages/agency/AgencyPipelinePage.jsx`
- `src/pages/UnitDetail.jsx`

## 8) Build / Lint
- `npm run build`: **PASS**
  - Existing CSS minify warning remains:
    - `Expected identifier but found "-"` in generated CSS input.
- Targeted lint (changed Phase 1 surfaces):
  - `npx eslint src/core/documents/packetStatusResolver.js src/pages/agency/AgencyPipelinePage.jsx` → **PASS**
- Focused lint including `UnitDetail.jsx` reports pre-existing unused-symbol errors in that file unrelated to this Phase 1 packet-state patch.
