# Document Start Phase 0

Implemented on 2026-07-05.

## Goal

Create the safest foundation for document-first mandate, OTP, and addendum creation without changing live listings, transactions, signing, or packet generation UI yet.

## Product Rules

- Document-first, not onboarding-first.
- Onboarding remains the recommended clean-data route, but it must not be the only way to create a document.
- Mandates can start from a seller lead, listing, manual seller/property details, or seller onboarding.
- OTPs can start from a transaction, accepted offer, manual buyer/seller/property details, or buyer onboarding.
- Addendums require an original document before generation.
- Manual documents must not be dead ends: later phases should allow linking manual documents back to clients, listings, transactions, or packets.

## UX Rules

- One reusable Start Document module.
- First screen should use plain choices: Use saved details, Enter details manually, Ask client to complete.
- Capture only what the selected document needs.
- Keep Save Draft available when details are incomplete.
- Block only Generate or Send when required details are missing.
- No raw JSON editor in agent-facing flows.
- Avoid nested cards, horizontal scrolling, and overlapping sticky footers.

## Architecture Rules

- Do not create a second document system.
- Reuse document packets, `sourceContextJson`, packet versions, and the existing Legal Document Workspace.
- Source modes are `saved_details`, `manual_details`, and `send_onboarding`.
- Manual mandate/OTP creation should be valid even when onboarding is incomplete.
- Addendum, amendment, and annexure flows should link to the original document packet or explicit original document reference.

## Phase 0 Implementation

- Added `src/core/documents/documentStartRules.js`.
- Added central packet types, document kinds, source modes, entry points, and context types.
- Added helpers for available start modes, required fields, and start-request validation.
- Added `npm run test:document-start-phase0`.

## Next Phase

Phase 1 should introduce the shared Start Document module UI without wiring it into every workflow yet.
