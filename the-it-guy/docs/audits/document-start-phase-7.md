# Document Start Phase 7

Implemented on 2026-07-05.

## Goal

Add the accepted-offer OTP start surface so agents can move from an accepted offer into the same editable OTP workspace without creating a second document flow.

## What Changed

- Added a `Prepare OTP` action to buyer-lead accepted-offer transaction panels.
- Added a `Prepare OTP` action to listing accepted-offer rows when the offer already has a linked transaction.
- Reused `StartDocumentModal` with the `accepted_offer_otp` entry point so agents can choose saved details, manual capture, or buyer onboarding.
- Accepted-offer OTP routes now open the existing legal document workspace with `documentStart=accepted_offer_otp`.
- The legal workspace now preserves `offerId` in packet source context and OTP generation source context.

## UX Rules Preserved

- No duplicate OTP editor.
- The transaction still has to exist before OTP generation.
- Buyer onboarding remains an option, but it does not auto-generate or auto-send the OTP.
- Agents keep the normal review step before sending for signature.

## Safety Boundaries

- No packet schema change.
- No signing workflow change.
- No offer status migration.
- No mandate behavior change.
- No template renderer rewrite.

## Next Phase

Phase 8 can add standalone document-library starts for creating documents that are not initially linked to a buyer lead, seller lead, listing, or transaction.
