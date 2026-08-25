# Sales Listing Workspace - Phase 3

Phase 3 connects the sales listing detail screen to the shared listing workspace framework.

## What Changed

- The sales listing detail page now imports the shared listing workspace tab model.
- The old sales-only outer tab list has been replaced with the shared sales tab order.
- The shared tabs are visible from the normal listing view and from the seller/mandate workspace.
- The shared tabs route into the current working sales panels:
  - `Seller` opens the seller profile area.
  - `Property` opens property details.
  - `Mandate` opens the seller mandate overview.
  - `Marketing` opens the marketing console.
  - `Features` and `Media` currently open property details while the panels are still consolidated.
  - `Syndication` opens the marketing console and the existing Property24 action panel.
  - `Activity` opens seller workspace activity.

## What Did Not Change

- No rental screens were changed.
- No Property24 payload logic changed.
- No database fields were changed.
- The existing sales forms and actions remain in place.

## Next Phase

Phase 4 should wire the rental listing detail screen into the same shared workspace framework, using `Landlord` as the owner label.
