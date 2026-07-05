# Document Start Phase 5

Implemented on 2026-07-05.

## Goal

Wire the Transaction Create OTP entry point into the same Start Document modal before opening the existing legal document workspace.

## What Changed

- The transaction Generate OTP action now opens the Start Document modal first.
- Saved and manual paths open the existing routed legal workspace in generate mode.
- The selected start path is preserved as `sourceMode`.
- The entry point is preserved as `documentStart=transaction_otp`.
- Buyer onboarding still uses the existing onboarding sender.
- The modal shows a compact buyer, property, purchase price, and finance summary.

## UX Rules Preserved

- Agents choose the start path before the OTP editor opens.
- Existing edit, send, view, and signed-view OTP actions are unchanged.
- The existing legal workspace remains the document generation surface.
- No duplicate OTP editor.
- No automatic send behavior.

## Safety Boundaries

- No schema change.
- No signing changes.
- No packet-generation engine change.
- No change to existing OTP approval, release, or upload actions.
- No change to mandate routes.

## Next Phase

Phase 6 can add a focused OTP intake panel for manual buyer, seller, property, and commercial term overrides.
