# Rentals CRM Phase 2 — Import and Intake Contract

Phase 2 provides a tenant/landlord-specific CSV intake contract without bypassing the shared CRM or creating duplicate contacts.

## Import safeguards

- Every row is mapped to a tenant or landlord role before it is eligible for import.
- Rows require a first name and at least one contact channel.
- Landlord rows require a property address; tenant rows require a desired area.
- Email and normalised phone keys identify possible duplicates against existing rental leads and within the incoming file.
- Invalid and possible-duplicate rows are excluded from automatic creation. They remain visible in the preview for a user to resolve.
- The import model produces the same form shape consumed by `createRentalLead`, preserving the Phase 1 CRM metadata envelope.

## Template

The canonical template includes role, contact details, source/campaign, role-specific qualification fields, typed inventory references, and notes. `createRentalLeadImportTemplateCsv()` is the single source for its header order.

## Boundary

This phase deliberately does not bulk-write to the database from file parsing. The UI may create only preview rows marked `ready`, one by one through the existing scoped lead service. Dedicated import-batch persistence, merge decisions, and external-source webhook ingestion belong to later phases.
