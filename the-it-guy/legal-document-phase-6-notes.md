# Legal Document Builder — Phase 6 Notes

## Current Signing Infrastructure
- Reused existing signing stack (no rebuild):
  - `document_packet_signers`
  - `document_signing_fields`
  - `document_packet_events`
  - signer portal route: `/sign/:token` (`SignerPortal.jsx`)
  - edge functions used by portal: `resolve-signer-token`, `signer-signing-action`
  - packet link generation API: `generateSigningLinks(...)`
  - signer field preparation API: `prepareSigningFields(...)`
- Existing token architecture and signer portal behavior remain unchanged.

## Send Workflow Implemented in LegalDocumentWorkspace
- Added signer-prep/send lifecycle directly in workspace (`LegalDocumentWorkspace.jsx`):
  1. Validate document lifecycle state + packet/version/template readiness.
  2. Ensure signing fields/signers exist (`prepareSigningFields`) when missing.
  3. Validate signer roster for required roles and email/name quality.
  4. Persist signer updates via `createDocumentPacketSigners` when draft overrides are provided.
  5. Generate secure links (`generateSigningLinks`) with configured expiry and base URL.
  6. Trigger existing `onSend` callback for channel-specific notification behavior.
  7. Transition packet lifecycle to `sent` (when applicable) and refresh state.

## Signer Validation Rules
- Required signer roles by packet type:
  - `mandate`: Seller required
  - `otp`: Buyer + Seller required
- Optional roles surfaced: Agent, Witness, Spouse (mapped to packet roles).
- Validation blocks sending when:
  - required signer name missing
  - required signer email missing/invalid
  - placeholder email (`@bridge.local`) present on required signer
  - duplicate signer emails detected
  - packet/version/template/lifecycle blockers are present
- Warning (non-blocking): declined/expired signer status prompts resend guidance.

## Signer Lifecycle Tracking
- Added richer signer readiness/track UI with:
  - role label
  - required marker
  - name/email visibility
  - status pill (`pending/sent/viewed/signed/declined/expired`)
  - timestamps (`viewed_at` / `signed_at` / updated fallback)
- Added signer status refresh action in workspace.

## Resend Handling
- Implemented resend workflow:
  - available in `sent` / `partially_signed`
  - regenerates links via `generateSigningLinks({ regenerate: true })`
  - logs resend event (`signer_links_resent`)
  - reuses existing `onSend` callback for resend notifications where supported

## Status Transition Logic
- Preserved Phase 5 guarded transitions and added signer progression support.
- Resolver improvement (`packetStatusResolver.js`):
  - detects partial signing based on signer statuses even when packet status is stale
  - maps mixed signer state (`signed` + active pending/sent/viewed) to `PARTIALLY_SIGNED`
- Prevents unsafe regression to editable states after send/sign.

## Signer UI Improvements
- Left panel signer checklist upgraded with role/name/email/status/timestamps.
- New right-side **Prepare for Signature** panel includes:
  - signer readiness cards
  - inline signer draft fields
  - prep/save/send/resend/refresh actions
  - clear blockers and warnings
- Keeps legal workspace premium/structured while surfacing who is blocking completion.

## Files Changed
- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/core/documents/packetStatusResolver.js`

## Build Result
- `npm run build` ✅ PASS
- Existing non-blocking warnings remain:
  - CSS minifier warning (`Expected identifier but found "-"`)
  - Vite large chunk warning

## Targeted Lint Result
- `npx eslint src/components/documents/LegalDocumentWorkspace.jsx src/core/documents/packetStatusResolver.js` ✅ PASS

## Known Limitations
- Resend callback behavior depends on each page-level `onSend` implementation.
- Existing signer API uses upsert by `(packet_version_id, signer_role, signer_email)`; role email changes may create additional signer rows in edge cases.
- Full signer ordering UI and advanced party matrix (strict sequential routing) are not yet implemented.
