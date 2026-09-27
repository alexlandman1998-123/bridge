# Transaction document entry-path map

Status: Phase 1 audit, 27 September 2026. This is a read-only map of the existing primary Arch9 workspace, not a new document policy or a handoff implementation. The [existing document-request policy](document-request-phase1-single-canonical-policy.md) remains the requirement catalogue.

## Working boundary

Portals collect or display information; they are not independent sources of truth. Before a transaction exists, a lead, private listing, offer, development/unit, or direct matter instruction may own source facts and files. Once created, the transaction must identify its real source records and coordinate its own parties, requirements, review state, and access. A source link is optional unless that creation path genuinely requires it. In particular, a seller lead must never be inferred from the presence of a listing or portal.

The audit distinguishes a source document from a transaction requirement: reusing the same stored file need not imply that a pre-transaction requirement and a transaction requirement are the same row. The handoff should link evidence and preserve provenance, not make a second copy of the file or a second current transaction request.

## Entry paths and current storage

| Entry path | Party and transaction facts | Document/answer origin | Existing handoff and access | Phase 2 boundary |
| --- | --- | --- | --- | --- |
| Seller lead → private listing → accepted offer | `private_listings.seller_lead_id` is optional lineage; the listing and seller onboarding carry the seller context. The accepted offer identifies the deal. | `private_listing_seller_onboarding.form_data`, `private_listing_document_requirements`, and `private_listing_documents` are listing-scoped. | Accepted-offer conversion links `listing_id`; the private-sale creation verifier links the seller portal context and promotes eligible seller files to transaction `documents`. | Preserve actual lead/listing/onboarding IDs. Do not treat the lead as the owner of listing-scoped seller files. |
| **Direct private listing, no seller lead** → accepted offer | Seller details can be entered against the listing. `seller_lead_id` may remain null. | The same listing-scoped onboarding, requirements, and files as above. | The seller portal context requires `listing_id`, not `seller_lead_id`; private-sale handoff verifies the listing, onboarding, portal context, promotion, and requirement satisfaction. | This is a first-class success case. Never create or require a seller lead merely to satisfy the transaction handoff. |
| Buyer lead / buyer contact → accepted offer | The offer supplies agreed price, finance and buyer context; accepted-offer conversion links the offer and listing and may link a buyer lead/contact. | Some agent-staged buyer files live in the persisted lead's `raw_enquiry_payload` before transaction creation. | Buyer lead files are promoted only when a persisted, linked buyer lead exists; the handoff validates storage paths and uses an idempotency key. The buyer portal later reads a transaction-scoped canonical projection. | Distinguish an actual persisted buyer lead from a temporary conversion object. Where no lead exists, do not fabricate one; use the offer/contact and investigate any unhanded files. |
| Developer / development unit → transaction | The transaction links `development_id` and `unit_id` and is classified as a developer sale. | Development-level files are stored separately in `development_documents`; unit and development facts predate the transaction. | The unit-status route calls the transaction wizard. The private-seller handoff is not run for developer sales. | Explicitly define which development/unit files satisfy transaction requirements and which are only contextual; this audit did not establish automatic file-to-requirement continuity for this route. |
| Directly created private matter, no prior listing | The wizard captures seller and buyer details on the transaction; `listing_id` can initially be null. | No pre-existing seller file is implied. | The private-sale verification function creates an internal listing and seller onboarding when needed, then links the seller portal context. It does **not** need a seller lead. | Record that the listing was created from the transaction, and avoid treating it as a pre-existing listing or copying transaction details back over later verified seller answers. |
| Directly created developer matter | The wizard can create a developer sale from development/unit and buyer inputs without a seller lead or private listing. | Development files and later transaction uploads are distinct contexts. | The transaction wizard creates canonical requirements and buyer portal setup; developer-sale classification determines party labels. | No private-listing seller handoff should be assumed. Resolve developer party identity and file applicability explicitly. |

## Facts, files, and access at the boundary

| Concern | Before a transaction | Once a transaction exists |
| --- | --- | --- |
| Seller identity and answers | The private listing and `private_listing_seller_onboarding` can hold these without a seller lead. Developer sales instead take their party context from the development/unit route. | The transaction has a seller/developer party and sale profile. Preserve links to the actual listing/onboarding/development source; do not overwrite a reviewed answer from a stale source snapshot. |
| Buyer identity and deal terms | A buyer lead/contact may exist, but the accepted offer is the deal source. | The transaction links the accepted offer and available buyer identity. Buyer onboarding can add later answers without requiring a pre-existing lead. |
| Stored files | Seller files: `private_listing_documents`; staged buyer-lead files: persisted lead payload plus storage; development files: `development_documents`. | Shared transaction files are in `documents`, with source identity and canonical requirement linkage where applicable. Promoted seller and buyer files retain their source storage path and provenance. |
| Portal access | Seller access is listing/onboarding-token scoped. A lead ID is optional. | Buyer access is token-scoped to the transaction canonical projection; seller context is linked from the listing to the transaction. Professionals use their transaction access. A document's audience must still be checked at metadata and storage level. |

## Current shared-document read paths

- The attorney Documents workspace builds rows from `requiredDocumentChecklist`, whose live read merges expected and persisted `transaction_required_documents` rows plus attorney supplemental rows. The agent document snapshot consumes those attorney-side rows. This is **not yet the same read model** as the buyer portal.
- The buyer portal uses `bridge_client_portal_canonical_document_projection` for transaction `document_requirement_instances` and linked documents, with a token-scoped buyer view.
- The seller portal is listing-scoped, using its seller document pack and listing requirements. A private transaction handoff projects transaction requirements back into listing rows for that portal and promotes seller uploads forward.
- The transaction's canonical requirement instance and shared document record should be the later phases' coordination point. Visibility of the requirement/status is separate from permission to open the file. Existing metadata/storage audience rules must remain enforced below the UI.

## Known gaps to resolve before a shared-view cutover

1. **Competing requirement reads:** attorney/agent and buyer/seller views can count different sets. A prior read-only comparison of a development matter found 15 stored attorney rows, 10 canonical instances, and only one direct link between them. Reconcile identities before changing screens.
2. **Misleading seller provenance:** the seller portal projection uses a display fallback like `seller-{listingId}` when no real seller lead exists. This is not a durable lead ID and must not be used as a handoff key.
3. **Wrong-side grouping risk:** seller-owned legacy rows can carry a `buyer_fica` group, while the attorney category resolver prioritises that group. Classification must use canonical party ownership, not a legacy group label.
4. **Developer evidence:** development-level documents have a separate store, but this audit did not prove a general rule linking each eligible file to a transaction requirement. Phase 2 must not mark one satisfied by filename alone.
5. **Post-creation edits and retries:** private seller handoff has a verifier and promotion path; buyer lead handoff has a separate idempotent promoter. The next phase must define retry and conflict outcomes across all entry paths without silent overwrites.
6. **Missing no-lead end-to-end assertion:** the focused direct-listing tests cover intake and seller portal projection, but none of the inspected checks proves a `seller_lead_id = null` listing through accepted-offer conversion, transaction creation, seller portal linkage, and document promotion. Add that case before changing the handoff.

## Evidence and focused checks

- Transaction wizard and private seller verification: [`src/lib/api.js`](../src/lib/api.js), `createTransactionFromWizard`; [`supabase/migrations/20260831125411_complete_agent_seller_handoff.sql`](../../supabase/migrations/20260831125411_complete_agent_seller_handoff.sql).
- Listing seller onboarding, documents, and optional lead link: [`src/services/privateListingService.js`](../src/services/privateListingService.js); seller portal context and fallback: [`src/services/clientPortalWorkspaceService.js`](../src/services/clientPortalWorkspaceService.js).
- Accepted-offer conversion and buyer lead evidence: [`src/lib/buyerLifecycleService.js`](../src/lib/buyerLifecycleService.js), [`src/lib/transactionLifecycleService.js`](../src/lib/transactionLifecycleService.js), [`src/services/documents/buyerLeadDocumentHandoffService.js`](../src/services/documents/buyerLeadDocumentHandoffService.js).
- Development/unit transaction path: [`src/lib/api.js`](../src/lib/api.js), `createDevelopmentTransactionFromUnitStatus`; development file store: `development_documents` reads in the same module.
- Portal and professional document reads: [`src/services/clientPortalWorkspaceService.js`](../src/services/clientPortalWorkspaceService.js), [`src/pages/AttorneyTransactionDetail.jsx`](../src/pages/AttorneyTransactionDetail.jsx), [`src/services/documents/matterDocumentWorkspaceModel.js`](../src/services/documents/matterDocumentWorkspaceModel.js).

## Verification on 27 September 2026

Passed: direct-listing seller portal phases 5 and 6, direct-listing requirement sync phase 4, buyer-lead document journey (16 tests), accepted-offer transaction boundary phase 3, and document-request cross-workspace parity phase 14. These are local code/contract checks, not authenticated live-portal acceptance.

Existing check failures, left untouched because they are outside this map-only change:

- `test:direct-listing-persistence-phase3` expects an older `listingPreviewDescription` expression in `AgentListingDetail.jsx`; the current code uses a different expression.
- `test:seller-onboarding-review-handoff` points to a script that is absent from the repository.
- `transaction-creation-lifecycle-persistence.test.mjs` points to an absent migration file, so it cannot currently verify the seller-handoff lifecycle. The current migration and creation call were inspected directly instead.

Phase 1 is the entry-path map and gap inventory above. It does not certify live user journeys, create records, reconcile historical data, or change portal permissions. Those are later-phase tasks.
