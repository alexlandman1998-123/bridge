# Property24 listing-category contract

Version: `arch9_property24_listing_category_contract_v2`

The category contract prevents a specialist listing from silently using residential fields. Commercial sales now have a dedicated v53/v55 schema-backed preview mapper; submission stays blocked until ExDev accepts a controlled test. Commercial rentals and the other specialist categories stay blocked.

## Evidence boundary

- The Property24 Listing Service v53 and v55 OpenAPI schemas include `Listing.commercialInfo` with `CommercialInfo.grossLettableAreaSqm`, alongside `propertyInfo.propertyTypeId` and `propertyFeatures.parking`.
- The authenticated production property-type catalogue returned ID 11, `Commercial Property`, on 29 September 2026.
- Commercial sale previews map the portal category to ID 11 even when Arch9 records the physical building as a house. The description still carries the property's actual zoning and terms.
- No commercial ExDev create/update or production publish has been performed. Supplier acceptance of a real commercial payload remains unverified.

## Matrix

| Arch9 category | Sale | Rental | Current publish state | Property24 fields verified by ExDev/current mapper | Arch9 information required before the future mapper |
| --- | --- | --- | --- | --- | --- |
| Residential | supported | supported | supported | Core listing payload, location/type mapping, marketing content/media, residential feature object | None beyond the normal readiness gate |
| Commercial | schema-backed preview | blocked | preview only until ExDev acceptance | Core listing, Commercial Property type 11, `commercialInfo.grossLettableAreaSqm`, parking | Gross lettable area, zoning, parking, sale price or terms |
| Industrial | pending | pending | blocked | None beyond the general Property24 account/catalog operations | Warehouse/factory area, yard size, power supply, loading access |
| Agricultural | pending | pending | blocked | None beyond the general Property24 account/catalog operations | Farm size, water supply/rights, agricultural use |
| Land/development | pending | not yet in scope | blocked | None beyond the general Property24 account/catalog operations | Erf size, zoning, development rights |

## Enforcement

`server/property24/listingCategoryContract.js` is the single source for this matrix. The base mapper checks the category before generating a submit-ready payload. Commercial sales with complete facts can produce a schema-backed preview, but `property24_commercial_exdev_acceptance_required` prevents submission. Missing gross lettable area, zoning, parking or sale terms receive specific data blockers. Other unsupported categories remain blocked.

## Unlock criteria for a category

1. Capture the exact Listing Service schema and allowed enums from Property24.
2. Confirm the Property24 property-type mappings for the category.
3. Add a category-specific Arch9-to-Property24 mapper—do not extend the residential feature object by guesswork.
4. Add create, update, photo, reassignment, lifecycle and reconciliation contract tests.
5. Complete one controlled ExDev create/update cycle and retain redacted evidence.
6. Before deploying commercial publishing, complete a controlled ExDev create/update and retain redacted acceptance evidence. I Sell's ExDev account currently has no saved ExDev credentials, so this cannot yet be done under its agency.
