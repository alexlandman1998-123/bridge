# Priority 2 Seller Lead -> Listing Lifecycle Certification

Date: 2026-06-09  
Scope: Seller Lead -> Seller Onboarding -> Mandate -> Private Listing -> Publication -> Transaction

## Final Recommendation

GO WITH REMEDIATION REQUIRED.

The Seller Lead -> Listing lifecycle is structurally sound and locally certified across idempotency, publication mapping, document continuity, relationship integrity, timeline continuity, portal alignment, and readiness logic.

There is one important ownership gap before this should be considered fully enterprise-safe: if the signed-mandate edge function creates a listing from scratch instead of finding an existing seller lead/listing shell, it does not currently inherit `branch_id`, and it sets `created_by` to `null`. Existing pre-created listing shells avoid this path, but the fallback conversion path should still preserve branch ownership and historical attribution.

## Lifecycle Diagram

```text
Seller Lead
  leads
  lead_activities
  lead_communication_events
        |
        v
Seller Onboarding
  private_listing_seller_onboarding
  client_portal_contexts
  canonical seller facts
        |
        v
Mandate Generated / Signed
  document_packets
  document_packet_versions
  document_packet_signers
  document_packet_events
        |
        v
Private Listing Shell / Operational Listing
  private_listings
  private_listing_activity
  listing_publication_data
  listing_media
  listing_external_links
        |
        v
Offer Accepted / Transaction
  transactions
  documents
  transaction_events
```

## Listing Creation Trigger Audit

What creates or advances the listing:

- Manual/seller intake shell creation: `createPrivateListing()` in `src/services/privateListingService.js`.
- Seller onboarding completion: `bridge_complete_private_listing_seller_onboarding()` updates onboarding, listing status, and lead linkage.
- Signed mandate finalisation: `ensureListingFromSignedMandate()` inside `supabase/functions/generate-final-signed-document/index.ts`.
- Listing publication data: seller onboarding and signed mandate conversion sync into `listing_publication_data`, not directly into marketing media/link tables.

Idempotency status: Pass.

Evidence:

- `private_listings_one_active_originating_lead_idx`
- `private_listings_one_active_seller_lead_idx`
- Signed mandate conversion searches by linked listing id, `originating_crm_lead_id`, and `seller_lead_id` before insert.
- Duplicate insert conflicts are caught and resolved by refetching the existing listing.

## Onboarding Field Mapping Matrix

| Onboarding Field | Destination | Status |
| --- | --- | --- |
| Seller name | Canonical seller facts / onboarding snapshot | Transferred |
| Seller phone | Canonical seller facts / onboarding snapshot | Transferred |
| Seller email | Canonical seller facts / onboarding snapshot | Transferred |
| ID / registration / trust fields | Canonical seller facts | Transferred |
| Marital regime / ownership structure | `private_listing_seller_onboarding`, canonical facts | Transferred |
| Existing bond / bank / account | Canonical facts / listing seller facts | Transferred |
| Property address | `listing_publication_data.address`; fallback `private_listings.address_line_1` during conversion | Transferred |
| Suburb / province | `listing_publication_data`; fallback private listing fields | Transferred |
| Property type | `listing_publication_data.property_type`; fallback `private_listings.property_type` | Transferred |
| Asking price | `listing_publication_data.asking_price`; fallback `private_listings.asking_price` | Transferred |
| Bedrooms / bathrooms / garages / parking | `listing_publication_data` | Transferred |
| Erf / floor size | `listing_publication_data` | Transferred |
| Rates / levies | `listing_publication_data` | Transferred |
| Description / notes | `listing_publication_data.description` | Transferred |
| Features | `listing_publication_data.features` | Transferred |
| Photos | `listing_media` / seller document flows, not direct onboarding form fields | Partial |

## Source Of Truth

| Domain | Source Of Truth | Certification |
| --- | --- | --- |
| Acquisition state | `leads` until conversion milestones | Pass |
| Operational listing lifecycle | `private_listings.listing_status`, `listing_visibility`, `is_active` | Pass |
| Seller legal/FICA facts | `private_listing_seller_onboarding` and canonical fact JSON | Pass |
| Marketing draft data | `listing_publication_data` | Pass |
| Media and external portals | `listing_media`, `listing_external_links` | Pass |
| Mandate legal record | `document_packets` and versions/signers/events | Pass |
| Seller uploaded documents before transaction | `private_listing_documents` | Pass |
| Seller uploaded documents after transaction | `documents` with `source = 'seller_portal'` and `source_document_id` | Pass |

The current model avoids duplicate sources of truth by using additive publication draft syncing. Existing agent-edited publication values win over seller onboarding drafts.

## Document Continuity

Status: Pass.

Seller uploads remain listing-scoped before transaction. When a transaction exists, `bridge_promote_private_listing_document_row()` promotes them into `documents` idempotently using `(transaction_id, source, source_document_id)`.

The mandate PDF remains in packet/document infrastructure. The listing stores mandate linkage/status, not the legal file source.

## Timeline Continuity

Status: Pass for architecture, pending UX adoption.

History remains in source tables:

- Lead acquisition: `lead_activities`, `lead_communication_events`
- Listing milestones: `private_listing_activity`
- Mandate signing: `document_packet_events`, `document_packet_signers`
- Transaction events: transaction tables/events

The read-only conversion timeline RPC exists and preserves source boundaries. The diagnostic report exists for missing milestone/activity links.

## Ownership Validation

| Object | Organisation | Branch | Current Owner | Attribution | Status |
| --- | --- | --- | --- | --- | --- |
| Seller lead | `leads.organisation_id` | `leads.branch_id` | `assigned_user_id` / `assigned_agent_id` | `created_by` | Pass |
| Existing private listing shell | `private_listings.organisation_id` | `private_listings.branch_id` | `assigned_agent_id` | `created_by` | Pass |
| Signed-mandate fallback listing insert | `organisation_id` | Missing | `assigned_agent_id` | `created_by = null` | Needs remediation |
| Transaction | `transactions.organisation_id` | `assigned_branch_id` | `owner_user_id` / `assigned_user_id` | `created_by` | Pass |

Required remediation:

- Include `branch_id` when `ensureListingFromSignedMandate()` inserts a listing from scratch.
- Preserve historical attribution where available, for example lead `created_by`, packet creator, or finalising actor.
- Prefer existing listing shells where present, as the current code already does.

## Portal Validation

Status: Pass.

Seller portal payload is token-scoped through `bridge_private_listing_seller_portal_payload(p_token)`. It returns listing, onboarding, requirements, and documents, and runs pending document promotion when the portal is reopened. Invalid tokens return no payload.

## Duplication Risk Report

Critical duplication risks: none found in the active lead/listing conversion path.

Controlled risks:

- `private_listings.seller_lead_id` and `originating_crm_lead_id` are still text compatibility links. They are guarded by unique partial indexes and monitored by diagnostics, but not fully normalised UUID foreign keys.
- Timeline continuity is diagnostic/read-only. It proves the story can be assembled, but UI must consume it consistently.

## Test Evidence

Passed locally:

- `npm run test:seller-onboarding-facts`
- `npm run test:seller-listing-publication-mapper`
- `npm run test:seller-listing-conversion-idempotency`
- `npm run test:seller-listing-document-continuity`
- `npm run test:seller-listing-relationship-integrity`
- `npm run test:seller-listing-relationship-graph-integrity`
- `npm run test:seller-listing-timeline-continuity`
- `npm run test:seller-listing-conversion-timeline`
- `npm run test:seller-document-propagation`
- `npm run test:seller-portal-alignment`
- `npm run test:seller-readiness`
- `npm run test:seller-journey`
- `npm run test:seller-analytics`

## Certification Decision

Seller Lead -> Listing is certified for core lifecycle architecture and local contract coverage.

Before calling it fully enterprise-safe in live/staging operations, fix the signed-mandate fallback listing ownership gap and run the service-only diagnostics against staging:

- `bridge_private_listing_relationship_integrity_report()`
- `bridge_private_listing_relationship_graph_integrity_report()`
- `bridge_private_listing_document_continuity_report()`
- `bridge_private_listing_timeline_continuity_report()`

