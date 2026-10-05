# Property24 typed listing model

Version: `arch9_property24_listing_category_model_v2`

Phase 2 introduces a category model alongside the Phase 0 contract boundary. It gives each listing category an explicit type universe, allowed transaction types, pricing modes, lifecycle states, required measurements and supported feature domain.

| Category | Property24 type IDs currently known | Transaction types | Category model | Publish state |
| --- | --- | --- | --- | --- |
| Residential | 4 House, 5 Apartment/Flat, 6 Townhouse | Sale, Rental | `residential_v1` | enabled |
| Commercial | 11 Commercial Property | Sale | `commercial_sale_v53_v55` | submit-ready after normal connection and listing checks |
| Industrial | 12 Industrial Property | Sale, Rental | `industrial_pending_property24_schema` | blocked |
| Agricultural | 10 Farm | Sale, Rental | `agricultural_v55` | enabled after normal connection and listing checks |
| Vacant land/plot | 8 Vacant Land/Plot | Sale | `vacant_land_sale_v55` | enabled after normal connection, positive land-area and listing checks; rentals and developments remain out of scope |

The known IDs come from Property24's authenticated catalogue. Commercial sales use the documented v53/v55 `commercialInfo` object. Vacant-land sales use the [official v55 schema](https://api.property24.com/swagger/v55-listing/docs): `propertyInfo.propertyTypeId = 8`, `propertyInfo.erf = { size, areaUnit: 'SquareMetres' }`, and optional `zoneType` only when the captured value matches the documented enum. Other zoning descriptions remain in the advert. Explicit hectares/acres are converted once by the shared land-area resolver; fields labelled m² retain their existing default. Private Property's Rev 4.7 Land category receives the same numeric square-metre area in `LandArea`, with its separate `LandType` identifier. Unknown units and non-positive areas block both previews. Rural `Portion`/`Ptn` addresses retain the supplied portion identifier in Private Property's mandatory street-number field.

The focused `test:property24-specialist-sales-mapping-phase4` check covers both portals, conversion parity, zoning enums, category aliases and rural addresses. Hydrated previews carry onboarding size units through to the mappers. A schema-backed payload and passing previews are not evidence that either portal has accepted a submission; no live listing submission was performed for this change.

The shared mapper now validates category/type consistency and listing lifecycle. For example, a rental cannot be submitted with a `Sold` lifecycle; it must use `Rented` when closed.

Agricultural sales and rentals use Farm type 10 from the saved authenticated catalogue. The official v55 Listing schema (checked 5 October 2026) documents the general `propertyInfo.erf`, `floorArea`, `propertyFeatures`, and `rentalInfo` objects; no separate farm object is required. Captured farm hectares are converted to square metres. A dwelling type such as House on an agricultural property maps to Farm, while a conflicting specialist type still fails category validation. Water rights and agricultural use remain in the advert description. Local checks cover sale/rental, new/update payloads, photo preservation, and the rental adapter. Supplier acceptance has not been tested with a live submission.
