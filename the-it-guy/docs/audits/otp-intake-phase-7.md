# OTP intake Phase 7

Implemented on 2026-07-31.

## Goal

Add a generation decision bar to the OTP intake panel so agents can clearly see whether the draft is blocked or ready, and what action comes next from a user perspective.

## What Changed

- Added a blocked vs ready decision state below the final OTP review.
- Blocked drafts show the first required action and keep the `Fix next blocker` path.
- Ready drafts point agents to the existing workspace Generate action when the parent provides the workspace anchor.
- The ready state explains that generation creates the OTP review PDF before signing links are prepared.
- Added a stable `otp-generation-workspace` anchor around the existing legal document workspace.

## UX Rules Preserved

- No duplicate OTP editor.
- No automatic OTP generation.
- No automatic send behavior.
- Agents still review the generated OTP before signer preparation.

## Safety Boundaries

- No schema change.
- No signing workflow change.
- No packet status state change.
- No mandate behavior change.
- No template renderer rewrite.
