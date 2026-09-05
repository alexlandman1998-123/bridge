# Rentals CRM Phase 1 — Canonical Lead Contract

Phase 1 introduces a versioned rental metadata envelope on the shared CRM lead record. It does not create a duplicate people table, alter the Sales lead schema, or change a Sales pipeline.

## Storage decision

Until a dedicated migrated rental-lead projection is introduced, the contract is stored in the shared `agency_leads.raw_enquiry_payload` compatibility payload. The reader also accepts a nested `rentalCrm` envelope, so later migration can be introduced without breaking existing rental leads.

The contract records:

- `leadType: rental`
- `role: tenant | landlord`
- rental stage
- organisation, branch, assignment, source, and campaign context
- typed relationship references for portfolio, property, unit, vacancy, mandate, application, and tenancy
- privacy, marketing, and screening consent states
- role-specific qualification data

## Ownership rules

- The platform CRM remains the canonical person/contact record.
- A rental role never changes the meaning of the shared Sales `lead_category`; legacy buyer/seller categorisation remains a compatibility field only.
- Property, unit, vacancy, mandate, application, and tenancy are linked by typed references. They are not copied into the contact record.
- The contract is backward compatible with existing rental metadata such as `arch9RentalLead`, `classification`, `role`, and `stage`.
- Consent state is captured as `granted`, `declined`, or `not_captured`; it is not inferred.

## Phase 1 completion checks

```text
node src/services/rentals/__tests__/rentalCrmLeadModel.test.js
node src/services/rentals/__tests__/rentalLeadClassificationModel.test.js
node src/services/rentals/__tests__/rentalLeadPipelineModel.test.js
```

Phase 2 will add the import and intake workflow using this contract. Phase 3 will replace the temporary four-stage rental pipeline with the approved tenant and landlord state machines.
