# Document Generator Simple Signing Phase 2

## Scope

Phase 2 adds the reusable visual shell for the simplified signer-facing UI.

The shell renders from the Phase 1 model contract and includes the reference-style `Review -> Sign -> Finish` progress card, document card, primary action card, help card, completion state, and secure footer.

## Integration Boundary

Phase 2 is not wired into SignerPortal yet. The shell accepts a document preview slot so Phase 3 can reuse the existing PDF/HTML preview renderer, required field overlays, signature capture, and completion handlers.

## Safety Notes

Phase 2 has no email delivery changes, no final-artifact changes, no final-completion truth changes, no signing-token authority changes, and no storage-access changes.

The component has no calls to signing APIs, dispatch functions, storage APIs, or final signed access functions. It only renders the model and raises action IDs back to the parent.

## Acceptance

Phase 2 is ready when the shell renders the simplified progress, document, action, help, and footer sections from the Phase 1 model, and when the guard confirms it remains presentation-only.
