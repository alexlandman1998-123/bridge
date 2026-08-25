# Listing Portal Action Plan - Phase 6

Phase 6 adds a shared publishing next-step panel to the sales and rental listing workspaces.

## What Changed

- Sales listings now show a simple publishing next step above the Property24 and Private Property readiness cards.
- Rental listings now show the same next-step pattern above the Property24 readiness card.
- The next step is calculated from the existing portal readiness summaries:
  - setup blockers come first,
  - missing listing fields come next,
  - ready-to-send portals come next,
  - live portals move into monitoring.
- The panel action reuses the existing sales and rental portal routes/actions.

## What Did Not Change

- No Property24 payload mapping changed.
- No Private Property payload mapping changed.
- No publishing API calls changed.
- No database fields were added.
- No automatic live publishing was added.

## Why This Matters

Agents should not need to understand portal API states. The listing screen now tells them the practical next step: fix setup, fix listing fields, check readiness, send the listing, or monitor the live portal.
