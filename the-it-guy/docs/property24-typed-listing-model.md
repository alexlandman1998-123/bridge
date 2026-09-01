# Property24 typed listing model

Version: `arch9_property24_listing_category_model_v1`

Phase 2 introduces a category model alongside the Phase 0 contract boundary. It gives each listing category an explicit type universe, allowed transaction types, pricing modes, lifecycle states, required measurements and supported feature domain.

| Category | Property24 type IDs currently known | Transaction types | Category model | Publish state |
| --- | --- | --- | --- | --- |
| Residential | 4 House, 5 Apartment/Flat, 6 Townhouse | Sale, Rental | `residential_v1` | enabled |
| Commercial | 11 Commercial Property | Sale, Rental | `commercial_pending_property24_schema` | blocked |
| Industrial | 12 Industrial Property | Sale, Rental | `industrial_pending_property24_schema` | blocked |
| Agricultural | 10 Farm | Sale, Rental | `agricultural_pending_property24_schema` | blocked |
| Land/development | 8 Vacant Land/Plot | Sale | `land_development_pending_property24_schema` | blocked |

The known IDs come from the current Property24 catalog mapping. They do not certify a category payload. Non-residential models are deliberately descriptive and validating only: their fields are captured as canonical Arch9 requirements, but no unverified Property24 JSON is emitted.

The shared mapper now validates category/type consistency and listing lifecycle. For example, a rental cannot be submitted with a `Sold` lifecycle; it must use `Rented` when closed.
