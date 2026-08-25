# Listing Portal Fix Guide - Phase 8

Phase 8 adds a shared "where to fix" guide to the sales and rental listing workspaces.

## What Changed

- Sales listings now show shortcuts for portal setup and missing listing fields.
- Rental listings now show the same shortcut pattern.
- Setup blockers route users to Syndication.
- Missing listing fields are classified into the most likely listing section:
  - owner,
  - property,
  - mandate,
  - marketing,
  - media,
  - syndication.
- The fix guide is generated from the same portal readiness summaries as the next-step panel, checklist, and portal cards.

## What Did Not Change

- No Property24 payload mapping changed.
- No Private Property payload mapping changed.
- No publishing API calls changed.
- No database fields were added.
- No automatic live publishing was added.

## Why This Matters

The user should not need to understand which technical field maps to which portal. If publishing is blocked, the listing page now points them to the section where the issue is most likely fixed.
