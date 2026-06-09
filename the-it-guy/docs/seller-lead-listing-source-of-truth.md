# Seller Lead to Listing Source of Truth

This contract defines ownership after the Seller Lead to Listing conversion path.
It is intentionally narrow: it does not redesign the workflow, and it does not
change the listing publication mapper.

## Canonical Lifecycle

```text
Seller Lead
  -> Seller Onboarding
  -> Mandate Generated
  -> Mandate Signed
  -> Listing Created
  -> Listing Published
```

## Ownership Rules

| Domain | Source of truth | Notes |
| --- | --- | --- |
| Acquisition status | `leads` | Lead stage/status may move through onboarding and mandate milestones. |
| Lead to listing linkage | `leads.listing_id`, `private_listings.seller_lead_id`, `private_listings.originating_crm_lead_id` | Linkage may sync during conversion and retries. |
| Listing lifecycle | `private_listings.listing_status`, `private_listings.listing_visibility`, `private_listings.is_active` | Listing owns operational lifecycle from `mandate_signed` onward. |
| Listing operational fields | `private_listings` | Title, address, suburb, city, province, type, price, assigned agent, and estimates are listing-owned after `mandate_signed`. |
| Seller onboarding facts | `private_listing_seller_onboarding.form_data` and canonical fact JSON | Legal, FICA, ownership, marital, finance, occupancy, and compliance facts remain onboarding/canonical facts. |
| Publication/marketing data | `listing_publication_data`, `listing_media`, `listing_external_links` | Bedrooms, bathrooms, sizes, rates, levies, features, descriptions, photos, links, and publication status live here. |
| Mandate legal record | `document_packets` plus `private_listings.mandate_packet_id` and `mandate_status` | The packet is the legal document source; the listing stores linkage/status. |
| Seller uploaded documents | `private_listing_documents` first, promoted to transaction `documents` when a transaction exists | Listing remains the pre-transaction document context. |
| Transaction state | `transactions` | Accepted offer and post-sale workflow state belongs to the transaction. |

## Conversion Rule

Before a listing reaches `mandate_signed`, signed mandate conversion may use lead,
placeholder, and onboarding data to complete missing listing shell fields.

After a listing reaches `mandate_signed` or later, signed mandate conversion may
sync only lifecycle, linkage, mandate, and onboarding status fields. It must not
backfill or overwrite listing-owned operational fields from a later-edited lead.

Operational fields protected after conversion:

- `assigned_agent_id`
- `title`
- `address_line_1`
- `property_type`
- `suburb`
- `city`
- `province`
- `asking_price`
- `estimated_value`

## Publication Draft Mapping

Seller onboarding completion and signed-mandate conversion may create or fill a
`Draft` row in `listing_publication_data` from seller onboarding facts. This
mapping is additive: existing agent-edited publication values win, and the auto
draft sync does not delete or replace `listing_media` or `listing_external_links`.

## Relationship Integrity

`leads.listing_id` and `transactions.listing_id` are UUID links to
`private_listings.id`. Future writes are guarded by `NOT VALID` foreign keys with
`on delete set null`, so existing data can be audited before constraint
validation while new broken links are rejected.

`private_listings.seller_lead_id` and `private_listings.originating_crm_lead_id`
remain text compatibility links for now. They are protected from duplicate
active listings by unique partial indexes, and monitored by the service-only
`bridge_private_listing_relationship_integrity_report()` diagnostic until a
separate safe type-normalisation migration can be planned.

The relationship integrity report checks:

- leads pointing at missing listings
- transactions pointing at missing listings
- listings pointing at missing UUID-shaped originating CRM leads
- listings pointing at missing UUID-shaped seller leads
- multiple active listings for the same originating CRM lead
- multiple active listings for the same seller lead

The extended service-only
`bridge_private_listing_relationship_graph_integrity_report()` diagnostic checks
cross-record graph integrity without rewriting data:

- lead/listing/transaction organisation mismatches
- seller lead text links pointing at leads from another organisation
- lead/contact and transaction/seller-contact organisation mismatches
- listing/lead mandate packet organisation mismatches
- unresolved listing seller profile compatibility links
- unresolved listing property profile compatibility links
- converted lead transaction links pointing at a different listing
- transactions whose listing no longer links back to a seller lead
- multiple transactions attached to the same listing

`private_listings.seller_profile_id` and `private_listings.property_profile_id`
remain compatibility links until the canonical seller/property profile tables are
defined. They are indexed and monitored, not forcibly constrained to an
ambiguous target.

## Document Continuity

Seller-uploaded documents remain listing-scoped in `private_listing_documents`
before a transaction exists. When a transaction exists, seller uploads are
promoted idempotently into transaction `documents` with
`source = 'seller_portal'` and `source_document_id` pointing back to the
original private listing document.

The signed mandate PDF remains a legal packet in `document_packets`. Listings
and leads store `mandate_packet_id` as linkage/status context; they do not become
the document source of truth. `private_listings.mandate_packet_id` is guarded by
a `NOT VALID` foreign key with `on delete set null` so existing continuity can be
audited before validation while new broken packet links are rejected.

The service-only `bridge_private_listing_document_continuity_report()` diagnostic
checks:

- listings or leads pointing at missing mandate packets
- mandate packet metadata pointing at a different listing
- seller upload rows with no file reference
- seller upload requirement/listing mismatches
- pending seller upload transaction promotions
- promoted seller uploads pointing at missing shared documents or transactions
- promoted shared document rows that no longer point back to the seller upload
- duplicate promoted shared documents for the same seller upload
- required seller document requests with no upload yet

## Timeline Continuity

Lead acquisition history remains lead-scoped in `lead_activities` and
`lead_communication_events`. Seller listing milestones remain listing-scoped in
`private_listing_activity`. Mandate signing history remains packet-scoped in
`document_packet_events` and `document_packet_signers`. Transaction events remain
transaction-scoped after offer acceptance.

Conversion must link these histories; it must not collapse them into one table
or delete the acquisition timeline. The service-only
`bridge_private_listing_timeline_continuity_report()` diagnostic checks:

- converted listings missing mandate-signed listing activity
- completed seller onboarding missing listing activity
- seller uploads missing upload activity
- completed mandate packets missing packet completion events
- signed packet signers missing signer events
- mandate activity pointing at missing packets
- seller document activity pointing at missing seller uploads
- duplicate listing milestone activity
- linked seller leads missing visible onboarding or mandate lead activity

The read-only `bridge_private_listing_conversion_timeline(private_listing_id,
lead_id)` RPC assembles the end-to-end seller conversion audit trail from the
source tables without copying or mutating history. It returns lead activity,
lead communications, listing milestones, onboarding submission, mandate packet
events, signer status, seller uploads, transactions, and transaction events in
chronological order.

## Practical Outcome

Repeating final signed document generation after conversion must be safe:

- still one active listing for the seller lead
- lead status/linkage stays current
- mandate status/linkage stays current
- listing-owned operational fields do not change from lead edits

This keeps the Seller Lead as the acquisition record and the Listing as the
operational marketing record.
