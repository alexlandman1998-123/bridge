# Document Request Phase 0: Freeze And Map

## Status

Implemented as a read-only baseline.

No runtime behaviour changes are included in this phase. Phase 0 freezes the current document-request landscape, records where requirements are generated or projected, and creates a repeatable audit report for the later cleanup phases.

## Purpose

The current programme has several document surfaces that must be reconciled before changing policy or UI behaviour:

- canonical document policy
- buyer onboarding and legacy buyer requirement generation
- seller/listing requirements and seller portal projection
- bond application document rules
- attorney and bond-originator request actions
- agent upload-on-behalf flows
- generated documents such as OTPs, mandates, disclosures, and workflow documents
- database containers in `transaction_required_documents`, `document_requests`, and `document_request_groups`

Phase 0 does not decide the final policy. It stops drift and gives Phase 1 onward a stable map.

## Command

```bash
npm run verify:document-request-phase0-freeze-and-map
```

This runs the Phase 0 contract test and writes:

```bash
output/document-request-phase0-freeze-and-map.json
```

The script is intentionally local and read-only. It does not connect to Supabase and reports:

```json
{
  "commit": false,
  "mutatedData": false
}
```

## Freeze Rules

- Do not add new client-visible required document keys until Phase 1 legal/product approval.
- Do not make deferred acquisition or improvement records client-visible unless a legal trigger is approved.
- Do not create another request table or portal-only request model.
- Do not retire legacy buyer/seller keys until adapter and backfill parity is proven.
- Do not treat generated documents as upload requests when they should satisfy canonical requirements.
- Do not ship request-container propagation without buyer, seller, agent, attorney, and bond-originator smoke coverage.

## Mapped Surfaces

Phase 0 inventories these surfaces:

- `config/document-request-phase1-legal-checklist.json`
- `src/core/documents/documentRequestCanonicalPlanner.js`
- `src/core/documents/documentRequestCanonicalAdapter.js`
- `src/services/documents/documentRequestCanonicalTransactionSyncService.js`
- `src/services/documents/documentRequestCanonicalRequiredDocumentSyncService.js`
- `src/lib/buyerRequirementEngine.js`
- `src/lib/purchaserPersonas.js`
- `src/modules/bond/application/documents/bondApplicationDocumentRules.js`
- `src/services/sellerDocumentRequirementsService.js`
- `src/services/clientPortalWorkspaceService.js`
- `src/components/client-portal/documents/ClientDocumentCentre.jsx`
- `src/pages/ClientPortal.jsx`
- `src/lib/api.js`
- `src/pages/AttorneyTransactionDetail.jsx`
- `src/services/attorneyWorkflow/attorneyWorkflowLaneService.js`
- `src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx`
- `src/components/BondApplicationsTable.jsx`
- `src/pages/AgentListingDetail.jsx`
- `src/pages/UnitDetail.jsx`
- `sql/schema.sql`

## Phase 0 Findings

1. The canonical checklist exists, but legal/product signoff is still pending for several policy rows.
2. Shared request containers exist through `createTransactionDocumentRequests`, but Phase 2 must prove those containers propagate and count consistently everywhere.
3. Attorney lane-specific requests use `requestAttorneyWorkflowLaneDocument`, which must be aligned with the shared request-container model.
4. Buyer generation still has legacy compatibility paths around `deriveOnboardingConfiguration` and the buyer requirement engine.
5. Bond rules are more granular than the current transaction-level `income_affordability_documents` canonical row.
6. Seller source includes `property_acquisition_record` and `capital_improvement_records`; both are frozen as not default client requests until legal policy says otherwise.
7. Agent listing upload-on-behalf currently runs through listing upload/projection paths, so it needs explicit buyer and seller parity coverage against the shared request containers.

## Exit Criteria

Phase 0 is complete when:

- the freeze/map report runs successfully
- every mapped source file exists
- the canonical policy summary is captured
- deferred or suspicious seller keys are recorded
- request-container surfaces for agent, attorney, and bond originator are identified
- no runtime code path or database row is changed

The next implementation phase is Phase 1: make the canonical policy the single approved source of truth.
