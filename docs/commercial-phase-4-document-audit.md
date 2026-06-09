# Commercial Phase 4 Document Audit

## Existing Tables

- `commercial_documents`: stores uploaded document metadata and links each file to `organisation_id`, `entity_type`, and `entity_id`. Phase 3 hierarchy fields (`branch_id`, `team_id`, `broker_id`) are already supported by the commercial API.
- `commercial_document_requests`: stores internal document requests linked by `organisation_id`, `entity_type`, and `entity_id`, with `document_name`, `category`, `requested_from`, `due_date`, `notes`, and `status`.
- `commercial_activity`: records document uploads, document requests, status changes, and archive actions against the linked commercial record.

## Storage Structure

Commercial uploads use the existing Supabase storage flow. Files are attempted against the configured commercial bucket candidates: `documents`, `transaction-documents`, and `private-listing-documents`.

Object paths follow:

`commercial/{organisationId}/{entityType}/{entityId}/{timestamp-random-fileName}`

Phase 4 does not replace this storage provider or create a second document engine.

## Existing Flows

- Upload: `CommercialDocumentUploadModal` -> `uploadCommercialDocument` -> storage upload -> `commercial_documents` insert -> activity log.
- Download/View: document row action -> `getCommercialDocumentDownloadUrl` -> signed Supabase URL.
- Request: `CommercialDocumentRequestModal` -> `createCommercialDocumentRequest` -> `commercial_document_requests` insert -> activity log.
- Status change: record-level document library calls `updateCommercialDocumentStatus`, which updates the existing document row and logs activity.
- Archive: record-level document library calls `archiveCommercialDocument`, marks the document archived, and logs activity.

## Existing Relationships

Documents and requests are linked through `entity_type` and `entity_id` for:

- Landlords: `commercial_landlord`
- Tenants: `commercial_tenant`
- Properties: `commercial_property`
- Vacancies: `commercial_vacancy`
- Requirements: `commercial_requirement`
- Deals: `commercial_deal`
- HOTs: `commercial_heads_of_terms`
- Leases: `commercial_lease`
- Listings: `commercial_listing`

## Phase 4 Extension Direction

The current system already supports linked uploads, requests, statuses, and activity. Phase 4 extends it with:

- Standard commercial document taxonomy.
- Reusable requirement templates.
- Request priority and due-date visibility.
- Compliance summaries for received, outstanding, approved, rejected, and review-state documents.
- Version metadata on existing document records.
- Document centre filtering and broker/manager oversight.

No storage provider, table ownership model, portal workflow, attorney workflow, or e-signature path is replaced in this phase.
