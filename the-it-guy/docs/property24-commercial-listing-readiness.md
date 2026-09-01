# Commercial listing readiness

Phase 4 makes category completeness visible in Arch9 before a commercial
listing is considered for future Property24 work. It uses the canonical
property and listing fields introduced in Phase 3; it does not add duplicate
portal fields or send a Property24 request.

## Required facts by category

| Category | Required facts |
| --- | --- |
| Commercial | Gross lettable area, zoning, parking, and at least one listing term. |
| Industrial | Warehouse/factory area, yard size, power supply, loading access. |
| Agricultural | Farm size, water supply or rights, agricultural use. |
| Land/development | Erf size, zoning, development rights. |

`src/modules/commercial/commercialListingReadiness.js` is the shared pure
evaluator. The commercial listing quality score calls it, so the list and
dashboard highlight the actual missing fact rather than scoring arbitrary JSON
metadata. `server/property24/commercialListingFacts.js` uses the same evaluator
when producing a future-mapper assessment.

Completeness is an Arch9 data-quality signal only. The Property24 category
contract remains blocked for commercial, industrial, agricultural, and
land/development listings until the exact v53 schema is received and verified
in ExDev.
