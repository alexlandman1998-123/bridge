# Document Generator Simple Signing Phase 1

## Scope

Phase 1 adds the adapter model for the simplified signer-facing UI.

The adapter converts the existing signer session used by `SignerPortal` into a small UI model containing document metadata, the `Review -> Sign -> Finish` stepper, the current action card, help copy, secure footer copy, and state-specific instructions.

## Coverage

The model covers all generated document types locked in Phase 0:

- `Mandate`
- `Offer to Purchase`

It also normalizes signer role labels such as `Seller`, `Buyer`, `Agent`, `Attorney`, and representative/trustee roles so the shell can use the same component tree for each signer.

## Boundaries

Phase 1 has no email delivery changes and no final-artifact changes. It does not call signing APIs, dispatch functions, storage APIs, or final signed access functions.

The model intentionally records only `previewAvailable` instead of copying raw preview URLs or fallback HTML into the UI contract. Later presentation phases can still pass the existing preview inputs directly to the preview component without leaking them into evidence or logs.

## Acceptance

Phase 1 is ready when mandate and OTP sessions both map into the shared model, the five simple states remain available, the correct primary actions are derived, and the adapter remains pure and side-effect free.
