# Physical Signed Upload Phase A

Implemented on 2026-07-31.

## Goal

Allow agents to complete a generated OTP or mandate that was signed physically by uploading the signed PDF against the exact generated packet version.

## What Changed

- Added a shared canonical physical signed upload helper for document packets.
- Added a signed physical upload panel with file selection, signed date, required attestations, and internal note.
- Signed uploads update the packet version final artifact metadata and lock the packet as completed.
- OTP physical upload now triggers the canonical signed OTP downstream workflow after packet completion.
- Legacy OTP signing/upload finalization remains disabled.

## Safety Boundaries

- No in-place overwrite of generated PDFs.
- No downstream OTP finance or attorney handoff until canonical packet upload completion succeeds.
- No automatic upload without explicit agent attestation.
- No change to digital signing finalization.
