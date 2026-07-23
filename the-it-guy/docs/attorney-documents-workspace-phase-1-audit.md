# Attorney Documents Workspace Phase 1 Audit

Date: 2026-07-23

## Purpose

Freeze the current Attorney Matter Documents architecture before any refactor of the Documents workspace. The next implementation phases should consolidate the existing document surface; they should not create a parallel document system.

## Active Routes And Components

- Primary matter route: `/transactions/:transactionId`.
- Route component: `src/pages/AttorneyTransactionDetail.jsx`.
- Attorney header: `ArchlineMatterHeader` inside `AttorneyTransactionDetail.jsx`.
- Workspace tab shell: `SharedTransactionShell` plus the attorney tab model in `AttorneyTransactionDetail.jsx`.
- Documents tab component: local `ArchlineDocumentsWorkspace` in `AttorneyTransactionDetail.jsx`.
- Legacy/shared document panel still exists as `src/components/DocumentsPanel.jsx`, but the attorney Archline route is currently using `ArchlineDocumentsWorkspace`.
- Document upload modal, request modal, review action modal state, and replace flow are currently owned by `AttorneyTransactionDetail.jsx`.

## Current Data Sources

- `documents`: uploaded and published transaction document records. Important fields currently read or written include `transaction_id`, `name`, `file_path`, `file_bucket`, `category`, `document_type`, `status`, `review_status`, `visibility_scope`, `stage_key`, `bucket_key`, `source`, `finance_lane`, `related_entity_type`, `related_entity_id`, and `canonical_requirement_instance_id`.
- `transaction_document_requirements`: canonical generated read model for transaction requirements. Its migration explicitly documents that UI should read this table instead of inferring document ownership from legacy checklist rows.
- `document_requirement_instances`: canonical requirement instance lifecycle table.
- `document_definitions` and `document_requirement_rules`: canonical reusable definitions and conditional requirement rules.
- `transaction_required_documents`: legacy/projection requirement rows still used for compatibility and live checklist shaping.
- `document_requests`: additional document requests created from the workspace.
- `document_packets`, `document_packet_versions`, and related packet tables: generated legal document and signing artifacts.
- `transaction_events` and `transaction_discussion`: activity and audit signals surfaced in the matter workspace.

## Current Fetch And View Model Flow

1. `fetchTransactionById(transactionId)` loads the transaction, documents, role players, participants, workflow data, document requests, and live checklist data.
2. `loadSharedDocuments()` reads rows from `documents`, applies viewer filtering, and enriches rows with signed URLs.
3. `buildLiveTransactionChecklistData()` and canonical adapters produce `requiredDocumentChecklist`.
4. `AttorneyTransactionDetail.jsx` derives:
   - `requiredDocumentRows`
   - `allDocumentLibraryRows`
   - `documentReadiness`
   - `documentHealthSummary`
   - `documentLibraryRows`
   - `archlineDocumentsByWorkflow`
5. `ArchlineDocumentsWorkspace` renders the readiness summary, required document table, filtered library, quick actions, missing documents, and recent activity.

This is functional, but the view-model logic is embedded in the route component and should be extracted before UI expansion.

## Current Storage Flow

- Uploads use `uploadDocument()` in `src/lib/api.js`.
- Files are written through `uploadToDocumentsBucket()`.
- The configured bucket candidates come from `DOCUMENTS_BUCKET_CANDIDATES`.
- Download/preview URLs are resolved with `getSignedUrl()`, falling back across candidate buckets.
- The storage model is private-first and relies on signed URLs or portal-safe final artifact descriptors.
- Client portal final signed documents intentionally return descriptors instead of raw storage paths.

## Current Upload And Review Flow

- `uploadDocument()` inserts into `documents`.
- It attempts canonical requirement linkage using:
  - `resolveCanonicalRequirementTargetForUpload`
  - `bridge_link_document_to_canonical_requirement`
  - key-based canonical fallback when needed
- It updates compatible request/requirement projections using:
  - `updateDocumentRequestFromUploadIfPossible`
  - `matchAndMarkRequiredDocumentFromUpload`
- It logs `DocumentUploaded` transaction events.
- It runs document automation through `runDocumentAutomationIfPossible`.
- Canonical review uses `reviewCanonicalDocumentRequirement()` and the `bridge_review_canonical_requirement` RPC.

## Current Status Model

The attorney workspace normalizes document statuses into:

- `missing`
- `requested`
- `uploaded`
- `pending_review`
- `verified`
- `rejected`
- `expired`
- `generated`

The broader canonical and legacy layers also use related states such as `pending`, `under_review`, `approved`, `accepted`, `completed`, `waived`, `not_applicable`, `reupload_required`, and `archived`.

Future phases should map these values through one model helper instead of duplicating normalization in UI components.

## Current Categories

The active UI filters are:

- `all`
- `critical`
- `missing`
- `pending_review`
- `bank_requested`
- `verified`
- `buyer`
- `seller`
- `finance`
- `transfer`
- `bond`
- `cancellation`
- `generated`
- `internal`

The target matter-level category set should be:

- `buyer`
- `seller`
- `finance`
- `transfer`
- `bond`
- `cancellation`
- `general`

The current implementation derives category using a mix of document metadata and text inference. Future work should prefer stable metadata in this order:

1. canonical requirement `visible_section`
2. `owning_workflow`
3. `responsible_role` / `requested_from`
4. `bucket_key`
5. `stage_key`
6. `lane_key` / `attorney_role`
7. `document_type`
8. final fallback text inference from category/name

## Current Permissions And Visibility

- Attorney matter access is checked before rendering the route.
- Attorney assignment permissions include document management capabilities.
- Frontend actions are gated by workspace role and available lane permissions.
- Backend access is enforced through Supabase RLS, scoped RPCs, token-aware document policies, and private storage policies.
- Document visibility is represented by `visibility_scope`, `is_client_visible`, `bucket_key`, and viewer-specific filtering.
- Internal documents must remain hidden from client portal surfaces unless explicitly shared.

## Current Fragmentation

- `AttorneyTransactionDetail.jsx` owns too much document workspace logic.
- Category resolution is partly heuristic and name-driven.
- Required rows, uploaded rows, request rows, and workflow rows are shaped in several local `useMemo` blocks.
- Legal generated documents live in `document_packets` and are projected into `documents` for final/signed surfaces.
- Seller/listing document requirements still have legacy tables and adapters.
- Commercial documents use separate commercial-specific tables and should not be folded into this residential attorney matter refactor.

## Phase 1 Decision

No migration is required for the first implementation step.

The next safe implementation step is to extract a pure matter-document workspace model from `AttorneyTransactionDetail.jsx`, add tests around it, and then evolve the UI on top of that model.

