# Attorney Transaction Workflow Phase 6 Notes

## Executive Summary

Phase 6 adds a conditional attorney document and signing requirements layer. Bridge can now resolve the exact legal document requirements for a transaction from transaction facts, map each requirement to the correct attorney lane, surface lane-specific document status in the attorney operations UI, generate missing document requests on explicit action, and map likely signing requirements to transfer, bond, and cancellation workflows.

This phase does not auto-send document requests on page load and does not change the existing signing engine.

## Implemented Files

- `the-it-guy/src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js`
- `the-it-guy/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js`
- `the-it-guy/src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx`
- `the-it-guy/scripts/verify-attorney-document-requirements.mjs`
- `supabase/migrations/202605150003_attorney_workflow_lanes.sql`

## Document Requirement Resolver

Added `resolveLegalDocumentRequirements(transaction)` and `resolveAttorneySigningRequirements(transaction)`.

The resolver uses the Phase 3 transaction facts resolver and returns structured requirements with:

- `id`
- `label`
- `description`
- `category`
- `laneKey`
- `attorneyRole`
- `requiredFrom`
- `appliesTo`
- `entityType`
- `required`
- `requestable`
- `reviewRequired`
- `affectsReadiness`
- `visibilityDefault`
- `clientUploadAllowed`
- `reason`

Normalized categories are:

- `fica`
- `entity_documents`
- `transfer_documents`
- `bond_documents`
- `cancellation_documents`
- `property_compliance`
- `development_documents`
- `signing_documents`
- `other`

## Conditional Document Coverage

Transfer attorney requirements include common transfer documents, buyer/seller FICA, transfer duty information, rates clearance, entity authority documents, and property compliance documents.

Bond attorney requirements appear only for bond or hybrid transactions and include bank instruction, grant letter, bond documents, guarantees, and bank signing requirements.

Cancellation attorney requirements appear only when seller bond cancellation is required and include cancellation instruction, existing bond account details, cancellation figures, cancellation guarantees, and bank cancellation documents.

Development, resale/private sale, and commercial transaction requirements are resolved from transaction context where available.

## Document Request Generation

Added `generateMissingAttorneyDocumentRequests(transactionId, options)` in the lane service.

Behavior:

- Resolves required legal documents.
- Compares against existing `document_requests`.
- Prevents duplicate requests by matching `requirement_id`, `document_type`, or `title`.
- Creates missing requests only when explicitly triggered by the user.
- Tags requests with lane, attorney role, category, provider, and requirement id where the schema supports it.
- Logs document request activity.

## Review And Rejection Logic

Added `reviewAttorneyDocumentRequest(...)`.

Supported decisions:

- `under_review`
- `approved`
- `rejected`
- `completed`

Rejected documents require a rejection reason. Review actions are permission-checked and activity-logged. The service uses safe fallback updates when optional document request columns are not present in older schema states.

## Signing Requirement Mapping

The signing resolver now maps requirements such as:

- buyer transfer signature
- seller transfer signature
- buyer bond signature
- seller cancellation signature
- company representative resolution signature
- trust trustee resolution signature

Each signing requirement is mapped to a lane, attorney role, signer type, and source requirement where applicable.

## UI Integration

The attorney workflow lanes panel now shows lane-specific document requirements under each relevant lane:

- requirement label and category
- provider party
- requested/uploaded/rejected/approved status
- document summary counts
- permission-gated request generation
- permission-gated review actions
- signing requirements per lane

The UI only shows relevant attorney lanes based on the existing workflow resolver. Cash transactions do not surface bond documents, and cancellation documents only surface when cancellation is required.

## Client Portal Safety

Phase 6 keeps document visibility conservative:

- default professional/internal visibility is retained for attorney documents
- client upload is allowed only when the requirement is requestable from a client party
- service-layer permission checks protect attorney document generation and review
- client portal exposure remains limited by existing client-facing document request and signing queries

No internal attorney notes, professional-only notes, or unrelated party document details are intentionally exposed by this phase.

## Migration Notes

The local migration adds optional document request metadata:

- `requirement_id`
- `rejection_reason`

It also extends transaction event validation for Phase 6 document/signing activity events.

This migration is local and has not been applied to the linked Supabase project by this phase.

## QA Fixtures

Added `scripts/verify-attorney-document-requirements.mjs` to exercise the pure resolver logic.

Covered scenarios:

- cash individual buyer/seller
- bond company buyer/seller
- hybrid trust buyer with company seller and cancellation
- development sale
- transfer, bond, and cancellation signing requirement mapping

## Verification Results

`node scripts/verify-attorney-document-requirements.mjs`

Result: passed.

Targeted lint:

`npx eslint src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js src/services/attorneyWorkflow/attorneyWorkflowLaneService.js src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx scripts/verify-attorney-document-requirements.mjs`

Result: passed.

`npm run build`

Result: passed.

Known existing build warnings:

- Vite CSS minify warning for generated CSS around `-: TZ.;`
- large bundle chunk warning

`npm run lint`

Result: failed due to existing repo-wide lint debt.

Known existing lint shape:

- 126 problems
- 95 errors
- 31 warnings
- existing unused variables, React hook/compiler issues, unresolved names in `src/lib/api.js`, and temporary spec globals

No targeted Phase 6 lint errors were found.

## Phase 7 Readiness

Phase 6 gives Phase 7 a normalized document/signing foundation:

- transaction facts drive required legal documents
- documents map to transfer, bond, and cancellation lanes
- lane ownership is explicit
- requests are generated intentionally, not automatically
- review/rejection actions are service-protected
- signing requirements are available for future packet automation

