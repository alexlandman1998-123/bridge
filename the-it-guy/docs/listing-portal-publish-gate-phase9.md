# Listing Portal Publish Gate - Phase 9

Phase 9 adds a shared publish decision gate to the sales and rental listing workspaces.

## What Changed

- Sales listings now show a "Publish decision" panel above the checklist.
- Rental listings now show the same decision panel.
- The decision is calculated from the existing portal readiness summaries.
- The gate tells the user whether publishing is:
  - blocked by portal setup,
  - blocked by missing listing details,
  - waiting for a readiness check,
  - ready for publish review,
  - already live and ready for monitoring.
- The gate action reuses the existing portal readiness action, so users are sent to the same syndication controls already used elsewhere.

## What Did Not Change

- No Property24 payload mapping changed.
- No Private Property payload mapping changed.
- No publishing API calls changed.
- No database fields were added.
- No automatic live publishing was added.

## Why This Matters

Before an agent clicks into portal controls, the listing now gives a simple decision: fix setup, fix listing details, run the check, review publishing, or monitor the live listing. This keeps sales and rentals separate while using one consistent publishing readiness pattern.
