# Physical Signed Upload Phase B

Implemented on 2026-07-31.

## Goal

Allow agents to upload a replacement signed copy for a physically signed OTP or mandate after completion, without overwriting the previous evidence or retriggering downstream handoff workflows.

## What Changed

- Added a canonical replacement signed copy helper for completed physical-signing packets.
- Required an explicit replacement reason before a replacement can be uploaded.
- Uploaded the replacement as a new final signed artifact path.
- Preserved the previous signed artifact in `replacedPhysicalSignedArtifacts`.
- Added replacement metadata under `physicalSigningReplacement`.
- Added `signed_physical_otp_replaced` and `signed_physical_mandate_replaced` audit events.
- Added a finalized-record replacement panel in the legal document workspace.

## Safety

- No overwrite: the previous signed artifact is kept in the packet source context audit trail.
- The packet remains completed after replacement.
- The replacement path does not retrigger downstream handoff.
- OTP replacement avoids re-running the finance, attorney, and transaction finalization workflow.
- Replacement access remains behind the existing finalization permission gate.
