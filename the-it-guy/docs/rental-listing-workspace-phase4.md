# Rental Listing Workspace Phase 4

Phase 4 connects the rental listing detail screen to the shared listing workspace navigation.

## What Changed

- Rental listings now use the same workspace tab model as sales listings.
- The owner tab is labelled `Landlord` for rentals.
- The rental detail page keeps its existing rental detail panels and route-based tabs.
- No Property24 rental payload, preview, publish, or backend handoff logic changed.

## Rental Tab Routing

| Workspace tab | Rental detail route |
| --- | --- |
| Overview | `overview` |
| Landlord | `landlord` |
| Property | `property` |
| Mandate | `mandate` |
| Marketing | `marketing` |
| Features | `property` |
| Media | `marketing` |
| Syndication | `syndication` |
| Activity | `activity` |

## Why This Matters

Sales and rentals can now share the same high-level listing navigation without forcing the rental module into the sales data model. The user sees one familiar structure, while each module still owns the fields and workflow that make sense for that mandate type.
