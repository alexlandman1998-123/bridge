# Seller Mandate Information Model - Phase 1

## Decision

The mandate is treated as a seller-owned document family, not a standalone navigation destination.

## Source Of Truth

- `Seller Profile` is the authoring surface for creating or regenerating the mandate.
- `Documents` is the system of record for storing, browsing, versioning, and retrieving mandate files.

## Canonical Model

- Canonical document type: `mandate`
- Document family: `seller_mandate`
- Storage surface: `documents`
- Authoring surface: `seller_profile`
- Versioning policy: `latest_with_history`
- Linked entity type: `seller_lead`

## Minimum Metadata

The model assumes the following metadata should exist for a mandate record:

- seller lead ID
- seller profile ID, when available
- canonical document type
- document variant, such as generated, signed, or draft
- linked entity type and ID
- source surface
- storage surface
- version number
- latest and previous document IDs
- status
- created and updated timestamps

## UI Language

Use short, action-oriented labels:

- `Generate Mandate`
- `Regenerate Mandate`
- `View in Documents`
- `Latest Mandate`

## Non-Goals For This Phase

- No navigation removal yet
- No document migration yet
- No seller page UI changes yet

