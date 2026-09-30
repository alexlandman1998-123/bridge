# Property24 listing-category contract

Version: `arch9_property24_listing_category_contract_v3`

The category contract prevents a specialist listing from silently using residential fields. Commercial sales have a dedicated v53/v55 schema-backed mapper and can pass local submission readiness on the organisation's configured Property24 connection. Commercial rentals and the other specialist categories stay blocked.

## Evidence boundary

- The Property24 Listing Service v53 and v55 OpenAPI schemas include `Listing.commercialInfo` with `CommercialInfo.grossLettableAreaSqm`, alongside `propertyInfo.propertyTypeId` and `propertyFeatures.parking`.
- The authenticated production property-type catalogue returned ID 11, `Commercial Property`, on 29 September 2026.
- Commercial sale previews map the portal category to ID 11 even when Arch9 records the physical building as a house. The description still carries the property's actual zoning and terms.
- No real commercial publish has been performed. Supplier acceptance of a real commercial payload remains unverified; a Property24 response is the final authority when a user explicitly publishes.

## Matrix

| Arch9 category | Sale | Rental | Current publish state | Property24 schema/catalog evidence | Arch9 information required before publish |
| --- | --- | --- | --- | --- | --- |
| Residential | supported | supported | supported | Core listing payload, location/type mapping, marketing content/media, residential feature object | None beyond the normal readiness gate |
| Commercial | supported by local mapper | blocked | submit-ready after normal connection and listing checks | Core listing, Commercial Property type 11, optional `commercialInfo.grossLettableAreaSqm`, parking | Zoning, parking, sale price or terms |
| Industrial | pending | pending | blocked | None beyond the general Property24 account/catalog operations | Warehouse/factory area, yard size, power supply, loading access |
| Agricultural | pending | pending | blocked | None beyond the general Property24 account/catalog operations | Farm size, water supply/rights, agricultural use |
| Land/development | pending | not yet in scope | blocked | None beyond the general Property24 account/catalog operations | Erf size, zoning, development rights |

## Enforcement

`server/property24/listingCategoryContract.js` is the single source for this matrix. The base mapper checks the category before generating a submit-ready payload. Commercial sales with complete facts can pass local readiness without an ExDev acceptance gate. The production publish route still checks the saved organisation connection, agent, exact suburb, expiry date, photos and the explicit publish action. Zoning, parking and sale price or terms are checked; gross lettable area is optional for a sale and is mapped only when supplied as a whole number of square metres. Other unsupported categories remain blocked.

## Unlock criteria for a category

1. Capture the exact Listing Service schema and allowed enums from Property24.
2. Confirm the Property24 property-type mappings for the category.
3. Add a category-specific Arch9-to-Property24 mapper—do not extend the residential feature object by guesswork.
4. Add create, update, photo, reassignment, lifecycle and reconciliation contract tests.
5. Verify the intended organisation and Property24 environment before a controlled submission, and retain the redacted portal response.
