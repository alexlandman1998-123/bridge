# Listing Portal Readiness - Phase 5

Phase 5 adds a shared portal readiness strip to the listing workspace.

## What Changed

- Sales listings now show shared readiness cards for Property24 and Private Property below the workspace tabs.
- Rental listings now show a shared Property24 readiness card below the workspace tabs.
- The readiness cards use the same visual component and summary model for both listing modules.
- Card actions route into existing screens:
  - Sales Property24 opens the existing syndication/marketing flow.
  - Sales Private Property opens the marketing channel flow.
  - Rental Property24 runs the existing readiness check, then opens Syndication after a preview exists.

## What Did Not Change

- No Property24 payload mapping changed.
- No Private Property payload mapping changed.
- No publishing API calls changed.
- No database fields were added.
- Rental Private Property remains backend-supported, but it is not shown as a normal rental UI card until the rental page has a user-facing Private Property management panel.

## Why This Matters

Users can now see portal readiness from the listing workspace without needing to know where the technical Property24 or Private Property controls live. Sales and rentals still stay separate, but the status pattern is shared.
