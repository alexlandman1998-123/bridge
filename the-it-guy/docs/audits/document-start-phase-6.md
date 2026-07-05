# Document Start Phase 6

Implemented on 2026-07-05.

## Goal

Add a focused OTP intake panel after the Transaction Create OTP start modal so agents can manually confirm buyer, seller, property, and commercial terms before generating the draft.

## What Changed

- Added `OtpDraftIntakePanel` for manual and saved OTP draft preparation.
- The panel shows readiness chips for buyer, seller, property, price, and signing parties.
- The OTP legal workspace now derives default draft values from transaction, buyer, onboarding, seller, and packet context.
- Edited OTP draft values are merged into the normal generation context before packet generation.
- OTP draft values are preserved in packet `sourceContext` as `otpDraft`.

## UX Rules Preserved

- The existing document editor remains the only OTP generation surface.
- The panel appears only before the first OTP packet is created.
- Agents can reset back to saved transaction defaults.
- No duplicate OTP editor.
- No automatic send behavior.

## Safety Boundaries

- No schema change.
- No signing workflow change.
- No packet status state change.
- No mandate behavior change.
- No template renderer rewrite.

## Next Phase

Phase 7 can add the same structured start surface for accepted-offer OTP generation and future standalone document-library starts.
