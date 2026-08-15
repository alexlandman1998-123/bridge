# Phase 2 - Buyer Bond Application OTP Unlock Gate

## Purpose

This phase makes the buyer-facing workflow explicit: the bond application route can exist inside the buyer portal, but the application content only opens once the OTP/signed OTP handoff has made the finance workflow ready.

## Delivered Behaviour

- `/client/:token/bond-application` remains available for originator-managed bond and hybrid transactions.
- Before OTP evidence exists, the modal shows a locked state.
- While OTP is loaded or awaiting signature, the modal shows a preparing state.
- Once signed OTP evidence exists, the existing guided or legacy application renders normally.
- The buyer portal overview card now uses the same gate and no longer implies that the application is generically available before OTP readiness.

## Unlock Sources

The gate unlocks when any of these are true:

| Source | Example |
| --- | --- |
| Transaction/onboarding status | `signed_otp_received`, `otp_signed`, `fully_signed` |
| OTP packet state | `portal.otpPacket.state === 'fully_signed'` |
| Final signed OTP access | `portal.otpPacket.finalSignedAccess.available === true` |
| Document evidence | A visible/uploaded document marked as signed OTP or signed offer to purchase |
| Finance stage fallback | Transaction has already reached `FIN`, `ATTY`, `XFER`, or `REG` |

## Locked and Preparing States

Before unlock:

- `locked` means no OTP handoff evidence has been found yet.
- `preparing` means OTP is loaded, generated, awaiting signature, awaiting other signatures, or finalising.

Both states block the bond application form and explain the next step to the buyer.

## Guardrails

- The gate only applies to bond or hybrid finance.
- The gate only opens the buyer application for bond-originator-managed finance.
- It does not parse raw OTP PDFs. It uses structured transaction, packet, status, and document metadata.
- The existing application UI is not removed; it is simply rendered behind the unlock gate.
