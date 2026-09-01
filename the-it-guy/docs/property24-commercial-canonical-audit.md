# Commercial canonical audit

Phase 7 provides a read-only reconciliation report for commercial listing
category data. It is intended to run after the Phase 3 schema migration and
the Phase 6 legacy backfill.

The report checks each listing against its linked property and identifies:

- missing linked properties;
- missing required category facts;
- legacy values still awaiting migration; and
- duplicate values that exist both in canonical columns and in legacy metadata.

Use `buildCommercialCanonicalAudit({ listings, properties })` for a supplied
dataset, or `getCommercialCanonicalAudit(organisationId)` from the commercial
intelligence service for the current workspace. The report is read-only.

An audit status of `canonical` means the Arch9 records are normalised according
to this data model. It does **not** mean a non-residential Property24 listing is
ready to publish: Property24 schema verification remains a separate, blocked
gate.
