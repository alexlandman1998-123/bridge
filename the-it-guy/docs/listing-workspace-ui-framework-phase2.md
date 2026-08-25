# Listing Workspace UI Framework - Phase 2

Phase 2 adds a shared UI foundation for the sales and rental listing screens without replacing the current live workflows yet.

## What This Adds

- A common listing workspace model for tabs, steps, and portal readiness states.
- Separate owner wording for each module:
  - Sales uses `Seller`.
  - Rentals uses `Landlord`.
- Shared tab order for both modules:
  - Overview
  - Seller/Landlord
  - Property
  - Mandate
  - Marketing
  - Features
  - Media
  - Syndication
  - Activity
- Reusable presentational components for a cleaner listing detail screen.

## What This Does Not Change Yet

- It does not move the existing sales listing page.
- It does not move the existing rental listing page.
- It does not change any Property24 or Private Property payload logic.
- It does not add database fields.

## Why This Matters

Sales and rentals stay separate from a business point of view, but the screens can now share the same shape. That avoids rebuilding two different interfaces for the same listing work.

## Next Phase

Phase 3 should connect the sales listing detail screen to this framework first, then Phase 4 can connect the rental listing detail screen.
