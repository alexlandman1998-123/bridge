# Document Start Phase 3

Implemented on 2026-07-05.

## Goal

Make the mandate workspace useful after someone chooses saved or manual details from the Start Document modal.

## What Changed

- Added a Manual mandate intake panel inside the existing Legal Document Workspace route.
- The panel covers seller, property, mandate, and commission details.
- Saved lead and onboarding details remain prefilled where they exist.
- Manual edits are stored in the existing mandate draft object.
- Mandate draft values now flow into the mandate mapper before generation.
- The start source is preserved with `sourceMode` and `documentStart` in packet context.

## UX Rules Preserved

- Agents fill one calm panel before generating the draft.
- The panel highlights missing core details without blocking draft generation.
- Fields are grouped into Seller, Property, and Mandate and commission.
- The existing Generate button remains the action point.
- No duplicate source editor or raw JSON editor is exposed.
- No horizontal scrolling or overlapping sticky controls were added.

## Safety Boundaries

- Existing Legal Document Workspace remains the editing and generation surface.
- No new packet engine.
- No signing changes.
- No database schema changes.
- No automatic send behavior.
- No OTP wiring yet.
- No listing detail wiring yet.

## Next Phase

Phase 4 can wire the listing-level Create Mandate entry point into the same Start Document modal and mandate intake surface.
