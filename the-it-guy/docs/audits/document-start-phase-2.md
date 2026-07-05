# Document Start Phase 2

Implemented on 2026-07-05.

## Goal

Wire the first real Create Mandate entry point in the safest possible place: the seller lead mandate action.

## What Changed

- Seller lead mandate entry point now opens the reusable Start Document modal when no mandate packet exists yet.
- Existing mandate packets still open directly in the existing Legal Document Workspace.
- Saved details and Manual details continue to `/pipeline/leads/:leadId/legal/mandate` in `generate` mode.
- Ask client to complete reuses the existing seller onboarding send function.
- The mandate start URL now preserves `sourceMode` and `documentStart` for later phases.

## UX Rules Preserved

- Saved details, Manual details, and Ask client to complete are visible from the same choice screen.
- Seller onboarding remains promoted without being mandatory.
- The seller actions panel no longer says onboarding must be submitted before mandate generation.
- Manual documents still route into the normal mandate editor before generation/signature.

## Safety Boundaries

- No new packet engine.
- No signing changes.
- No direct packet creation from the modal.
- No OTP wiring yet.
- No listing detail wiring yet.
- No database schema changes.
- No raw JSON or source-context editing.
- Existing Legal Document Workspace remains the generation/editing surface.

## Next Phase

Phase 3 can improve the manual mandate intake fields inside the legal workspace so agents can fill seller/property/commission gaps more completely before generation.
