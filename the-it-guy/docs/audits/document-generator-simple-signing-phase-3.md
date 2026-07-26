# Document Generator Simple Signing Phase 3

## Scope

Phase 3 wires the simplified signing shell into `SignerPortal`.

The portal now builds the Phase 1 simple signing model and renders `SimpleSigningShell` around the existing document preview, field overlay, signature capture, commit confirmation, completion refresh, and completed PDF access handlers.

## Runtime Boundary

This phase changes the signer-facing UI only. It does not change email delivery, does not change final PDF generation, does not change completion truth, does not change token authority, does not change storage paths, and does not change document generator output.

The existing signing APIs remain the runtime source of truth:

- `resolveExternalSignerSession`
- `applySignerField`
- `saveSignerAsset`
- `completeSignerSigning`
- `resolveSignerFinalSignedArtifactAccess`

## User Flow

The simplified shell presents `Review -> Sign -> Finish`, embeds the existing PDF/HTML document preview, exposes zoom/download controls, and routes the primary action card to the existing signer handlers.

For signature and initial fields, the primary action now opens the existing saved-signature/capture path instead of only navigating the page.

## Safety Notes

The old multi-card signer surface is not rendered in the signed-in signer path. Error recovery still uses the existing help recovery card when a signing token cannot be resolved.

Completion still uses the existing commit confirmation before calling the final signing API.

## Acceptance

Phase 3 is ready when the portal renders the simplified shell, preserves the existing signing backend calls, keeps the document preview and field overlays inside the shell, and passes the Phase 0-3 guard suite plus a production build.
