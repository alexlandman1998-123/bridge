# Canonical commercial category facts

Phase 3 stores commercial, industrial, agricultural, and development-land
facts in Arch9's existing commercial records. These fields are the source of
truth for the property or listing; they are not a second, Property24-specific
data model.

## Ownership

| Record | Facts |
| --- | --- |
| `commercial_properties` | Physical property facts: GLA, office and warehouse area, parking, zoning, industrial access/power/yard/loading/roller-door/crane facts, agricultural land/water/irrigation/use facts, and land/development rights. |
| `commercial_listings` | Market-specific facts: operating costs, rates and taxes, lease term in months, deposit amount, and utilities policy. |
| `commercial_vacancies` | Unit-specific availability, available area, rental, and availability date. |

Most Phase 3 fields were already canonical. The migration adds only
`crane_capacity`, `water_supply`, `agricultural_use`, `development_rights`,
`subdivision_status`, and the five listing market-term columns.

## Capture paths

The property editor exposes the category-specific facts directly. The new
listing wizard promotes relevant industrial, agricultural, and development-land
facts to a newly-created canonical property. It keeps only noncanonical,
supporting wizard input in `metadata_json`; market terms are saved once as
first-class `commercial_listings` columns.

Development-land fields are available for `development_land` and `land`
property types; agricultural fields remain separate.

## Portal boundary

`server/property24/commercialListingFacts.js` reads the canonical listing and
property records and produces a category-fact assessment for the future
Property24 mapper. It makes no network request and emits no portal payload.
The Phase 0/Phase 2 category contract still blocks commercial, industrial,
agricultural, and development-land publishing until the Property24 v53 field
schema is verified and an explicit mapper is implemented.

## Deployment order

Apply `supabase/migrations/20260901143358_property24_category_listing_facts.sql`
before deploying the application code. The application selects and writes the
new columns, so deploying code first would make commercial list queries fail
against a database that has not received the migration.
