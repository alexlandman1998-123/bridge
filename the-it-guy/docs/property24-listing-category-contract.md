# Property24 listing-category contract

Version: `arch9_property24_listing_category_contract_v1`

This is the Phase 0 boundary for Property24 listing categories. It keeps the already-vetted residential mapper from silently publishing commercial, industrial, agricultural, or land/development stock with residential fields.

## Evidence boundary

- The Property24 Listing Service v53 endpoints and residential sale/rental workflow have ExDev evidence.
- Property24 property-type catalog entries for Farm, Commercial Property, and Industrial Property exist.
- A property-type catalog entry is **not** proof that the residential payload is valid for that category.
- Until Property24 provides the category-specific request schema and an ExDev create/update succeeds, those categories remain server-blocked.

## Matrix

| Arch9 category | Sale | Rental | Current publish state | Property24 fields verified by ExDev/current mapper | Arch9 information required before the future mapper |
| --- | --- | --- | --- | --- | --- |
| Residential | supported | supported | supported | Core listing payload, location/type mapping, marketing content/media, residential feature object | None beyond the normal readiness gate |
| Commercial | pending | pending | blocked | None beyond the general Property24 account/catalog operations | Gross lettable area, zoning, parking, commercial terms |
| Industrial | pending | pending | blocked | None beyond the general Property24 account/catalog operations | Warehouse/factory area, yard size, power supply, loading access |
| Agricultural | pending | pending | blocked | None beyond the general Property24 account/catalog operations | Farm size, water supply/rights, agricultural use |
| Land/development | pending | not yet in scope | blocked | None beyond the general Property24 account/catalog operations | Erf size, zoning, development rights |

## Enforcement

`server/property24/listingCategoryContract.js` is the single source for this matrix. The base Property24 mapper evaluates it before generating a submit-ready payload. A non-residential or unclassified listing is returned as a normal preview with a specific data blocker; it cannot be submitted accidentally.

## Unlock criteria for a category

1. Capture the exact Listing Service v53 schema and allowed enums from Property24.
2. Confirm the Property24 property-type mappings for the category.
3. Add a category-specific Arch9-to-Property24 mapper—do not extend the residential feature object by guesswork.
4. Add create, update, photo, reassignment, lifecycle and reconciliation contract tests.
5. Complete one controlled ExDev create/update cycle and retain redacted evidence.
6. Change the matrix category from `blocked_pending_property24_contract` to `supported` only with that evidence.
