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

### Seller Document Center Contract

The seller document center source of truth is listing-scoped:

- requirements: `private_listing_document_requirements`
- uploads: `private_listing_documents`
- signed mandate artifact: `document_packets.final_signed_artifact`

The frontend contract is `buildSellerDocumentSourceOfTruth()` in
`src/services/sellerDocumentRequirementsService.js`. Listing documents, seller
lead documents, and seller portal documents must consume this model instead of
building separate requirement/checklist arrays.

Each row exposes the same fields for every touchpoint:

- `contextType` / `contextId`
- `requirementId`
- `key`
- `title` / `label`
- `category`
- `group`
- `status`
- `statusBucket`
- `required`
- `applicable`
- `complete`
- `blocking`
- `hasUpload`
- `visibility`
- `source.requirement`
- `source.document`
- `upload`

Conditional requirements such as gas and solar compliance must appear through
the same contract. A final signed mandate packet artifact must satisfy the
`signed_mandate` requirement in this model; individual screens must not inject a
separate mandate row with their own status rules.

### Seller Document Requirement Reconciliation

Phase 4 adds an operational reconciliation pass for existing listings created
before the shared document contract was persisted consistently. The
`buildSellerDocumentRequirementReconciliationReport()` helper compares the
expected source-of-truth requirement keys with active rows in
`private_listing_document_requirements` and classifies each listing as ready or
needing a requirement sync.

`runSellerDocumentRequirementReconciliation()` is dry-run by default. It may scan
an organisation or explicit listing ids, and it only applies changes when called
with `dryRun: false`. The apply path delegates to
`syncPrivateListingRequirements()` with reason
`seller_document_reconciliation_phase4`, so it uses the same Phase 3 schema-safe
upsert path and does not create a separate backfill writer.

`npm run reconcile:seller-documents -- --organisation-id=<uuid>` prints the
dry-run plan. Add `--apply` only after reviewing the syncable queue.

Phase 5 surfaces the same reconciliation in Platform Diagnostics as
`Seller document reconciliation`. The console runs a dry-run first, lists missing
and stale requirement keys, and applies only the listing ids from that reviewed
dry-run plan. The apply button delegates to the Phase 4 runner and therefore
uses `syncPrivateListingRequirements()` rather than a separate repair writer.

Phase 6 turns reconciliation into a non-mutating release gate. Use
`npm run verify:seller-documents -- --organisation-id=<uuid>` or
`npm run reconcile:seller-documents -- --organisation-id=<uuid> --gate` to run
the dry-run report and fail the process when listings still have syncable,
missing, stale, load-failed, or manual-review document requirement drift. The
gate refuses `--apply`; repairs must still go through the reviewed dry-run/apply
flow from Phase 4 or Platform Diagnostics from Phase 5.

Phase 7 packages the gate evidence into an operator runbook. Use
`npm run prepare:seller-documents -- --organisation-id=<uuid>
--output-dir=<dir>` to write the dry-run report, gate packet, syncable listing
queue, manual-review queue, and Markdown runbook. The packet generator is
dry-run-only and can also consume a saved report with
`--input=<seller-document-reconciliation-report.json>` for release evidence.

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

## Signed Mandate Runtime Continuity

When a mandate is finalized, the runtime should expose one continuity model for
the lead, listing, document center, seller portal, and activity feed. The
`buildSellerMandateContinuityModel()` helper checks:

- the mandate packet can be resolved and has a signed signal
- the lead and listing retain the mandate packet link when present
- the listing mandate status is signed
- a seller-visible signed mandate document or final packet artifact exists
- a seller-visible `mandate_signed` activity exists
- the seller portal context points at the same packet when that context is
  available

The finalization path also dispatches `itg:seller-mandate-signed` with the
seller onboarding token, seller lead id, private listing id, mandate packet id,
version id, signed timestamp, and linked document id so open agent workspaces can
sync without waiting for a full page refresh.

## Agent Operational Visibility

The listing workspace surfaces signed mandate continuity in its Listing
Readiness sidebar as `Mandate Continuity`. This panel uses the same
`buildSellerMandateContinuityModel()` contract and shows each check so agents can
see whether the signed mandate is connected to the listing, seller-visible
document center, seller portal context, and activity feed before treating the
listing as fully activation-ready.

## Operational Continuity Audit

Phase 8 adds a read-only signed mandate continuity report for support and release
checks. `createSellerMandateContinuityReport()` evaluates signed mandate listing
records with the same `buildSellerMandateContinuityModel()` contract used by the
seller portal and listing workspace, then summarizes ready, warning, and blocked
records.

The report highlights the operational actions needed to restore continuity:

- resolve the signed mandate packet id
- sync the packet id onto the seller lead and listing
- mark the listing mandate status as signed
- link the seller-visible signed mandate document
- create the seller-visible `mandate_signed` activity event
- refresh seller portal context packet linkage
- send the seller portal password setup invite after the mandate is signed

`npm run report:seller-mandate-continuity` is the service-role operational entry
point. It reads signed mandate listings, related private listing documents,
listing activity, leads, mandate packets, seller portal contexts, and mandate
packet events. It must not repair, backfill, delete, or publish data, and it must
not send seller portal invites. The optional `--gate` and `--fail-on-warning`
flags can be used by release checks to fail a run when signed mandate continuity
is blocked or under review.

## Diagnostics Console Visibility

Phase 9 surfaces the same read-only signed mandate continuity audit in the
Platform Diagnostics operations center. The console uses
`getSellerMandateContinuityDiagnosticsSnapshot()` so the in-app view, CLI report,
and future release gates read the same listing, lead, document, activity, mandate
packet, and seller portal context graph.

The normal diagnostics load is intentionally observational: it shows summary
counts, release-gate status, query warnings, and the first action per blocked or
warning record. It does not repair records, resend documents, mutate activity, or
publish listings from the diagnostics page.

Seller portal invite delivery is derived from `document_packet_events` on the
mandate packet. A `seller_portal_invite_sent_after_mandate_signed` event clears
the invite check; ready, skipped, failed, or missing invite events leave the
record under review so support can retry deliberately.

Operational backfill is explicit and defaults to dry-run via
`backfillSellerPortalInvitesAfterSignedMandates({ dryRun: true })`. Applying the
backfill with `dryRun: false` targets non-blocked signed mandate records whose
portal invite is missing or needs action, and reuses the same idempotent
`sendSellerPortalInviteAfterMandateSigned()` helper as the finalization runtime.

Phase 4 exposes this backfill in Platform Diagnostics as a two-step operational
control: dry-run first, then a separate confirmation before any live seller
portal password setup emails are sent. The normal continuity load remains
read-only; only the explicit apply action may send invite emails, and the result
is refreshed back into the same continuity view.

Phase 5 suppresses legacy early seller portal invite paths. Seller onboarding
submission may still sync portal context and notify internal users, but it must
not send the seller portal password setup link. Manual resend/reset actions and
the `seller_portal_link` email route must verify a signed mandate before sending
the portal invite.

Phase 6 accepts linked signed mandate packet evidence in the server email guard.
The `seller_portal_link` route still requires a listing id, but it may verify the
post-signature rule from either signed listing state or the listing's
`mandate_packet_id` pointing at a completed/signed mandate packet or a
`document_packet_versions` final signed artifact. This prevents a false block
when listing lifecycle sync lags behind final signed document generation.

Phase 7 records guarded portal invite blocks as packet events. If the
`seller_portal_link` route is called before a signed mandate can be verified, the
route still returns `seller_portal_invite_requires_signed_mandate`, and when the
listing is linked to a mandate packet it also appends
`seller_portal_invite_blocked_before_mandate_signed` to
`document_packet_events`. Diagnostics treat blocked, failed, skipped, ready, or
missing invite events as action required, but any
`seller_portal_invite_sent_after_mandate_signed` event clears the invite check.

Phase 8 locks live invite backfill to the dry-run plan. Platform Diagnostics
passes the planned listing and packet pairs from the dry-run into
`backfillSellerPortalInvitesAfterSignedMandates({ dryRun: false,
plannedCandidates })`; the live apply only sends candidates still present in that
plan. If a planned record no longer appears in the current signed mandate
snapshot, the apply result marks it skipped with
`not_in_current_signed_mandate_snapshot` instead of sending a changed candidate
set.

## Practical Outcome

Repeating final signed document generation after conversion must be safe:

- still one active listing for the seller lead
- lead status/linkage stays current
- mandate status/linkage stays current
- listing-owned operational fields do not change from lead edits

This keeps the Seller Lead as the acquisition record and the Listing as the
operational marketing record.
