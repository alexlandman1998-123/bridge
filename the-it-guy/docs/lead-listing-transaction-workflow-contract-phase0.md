# Lead, Listing, Offer, Transaction Workflow Contract - Phase 0

Date: 2026-08-15

Purpose: lock the normal residential buyer/seller workflow boundary before the
remaining gap-remediation phases. This document is the product and engineering
contract for when a lead may become a listing, when a buyer may enter offer
work, and when a transaction may be created.

## Canonical Lifecycle

### Seller Path

```text
Seller Lead
  -> Seller Onboarding
  -> Mandate Generated
  -> Mandate Signed
  -> Listing Created
  -> Listing Published
  -> Buyer Offer
  -> Accepted Offer
  -> Transaction
```

Rules:

- The seller lead remains the acquisition record.
- Seller legal, FICA, ownership, marital, bond, occupancy, and compliance facts
  remain seller-onboarding facts until they are projected into their owning
  downstream context.
- The listing owns operational listing state from `mandate_signed` onward:
  title, address, suburb, city, province, property type, price, assigned agent,
  marketing draft, publication data, media, external links, and active/archive
  status.
- A signed mandate may create or complete a listing shell only when it preserves
  organisation, branch, owner, attribution, mandate linkage, seller lead linkage,
  and idempotency.
- Pre-transaction seller documents stay listing-scoped. They may be promoted
  into transaction documents only after a transaction exists.

### Buyer Path

```text
Buyer Lead
  -> Qualification / Search Requirement
  -> Listing Interest
  -> Viewing / Engagement
  -> Offer
  -> Accepted Offer
  -> Transaction
  -> Buyer Onboarding
```

Rules:

- A buyer lead is not a transaction.
- A buyer lead without a selected listing remains an opportunity/search record.
- A buyer lead with a selected listing may enter offer work.
- Buyer onboarding before a transaction is offer-context onboarding only. True
  transaction buyer onboarding requires a persisted transaction onboarding
  record and `/client/onboarding/:token`.
- The accepted offer is the normal transaction boundary.

## Transaction Creation Boundary

The default transaction creation path is:

```text
accepted offer + buyer lead + listing + agent + organisation + branch
  -> idempotent transaction creation
```

A transaction may be created only when one of these is true:

- `accepted_offer_id` is present and the offer is accepted or already converted.
- An explicit manual override reason is present and the actor has permission to
  bypass the accepted-offer boundary.

The UI and services must not describe a transaction as created unless there is a
persisted transaction id and the conversion receipt or reuse receipt confirms
that the transaction is durable.

## Required Transaction Inputs

Every normal accepted-offer transaction must carry or resolve these values:

| Variable | Required | Source |
| --- | --- | --- |
| `organisation_id` | yes | lead, listing, offer, active workspace |
| `branch_id` / `assigned_branch_id` | yes | lead, listing, active branch |
| `assigned_agent_id` | yes | lead, listing, offer, actor |
| `created_by` | yes | actor, lead creator, packet creator, service actor |
| `buyer_lead_id` / `originating_buyer_lead_id` | yes | buyer lead / accepted offer |
| `buyer_contact_id` | yes when known | buyer lead / offer |
| `seller_lead_id` / `originating_crm_lead_id` | yes when listing came from seller lead | seller lead / listing |
| `seller_contact_id` | yes when known | seller lead / listing / offer |
| `listing_id` | yes | selected listing / accepted offer |
| `accepted_offer_id` | yes for normal path | accepted offer |
| `transaction_creation_override_reason` | required only for override path | authorised manual action |
| `purchase_price` / `deal_value` | yes | accepted offer |
| `finance_type` | yes | accepted offer / buyer onboarding |
| `purchaser_type` / `buyer_entity_type` | yes | buyer onboarding / offer |
| `seller_entity_type` | yes when known | seller onboarding / listing |
| `seller_has_existing_bond` / `cancellation_required` | yes when applicable | seller onboarding / listing |
| `property_tenure` | yes when known | seller onboarding / listing |
| `vat_treatment` | yes when known | seller onboarding / listing |
| `idempotency_key` | yes | organisation + accepted offer, or override command |

## Required Gate Evidence

The sale-confirmed gate requires:

- accepted offer or authorised override;
- linked buyer;
- linked listing/property.

The accepted-offer conversion health check must confirm:

- offer status is `converted_to_transaction`;
- offer has `transaction_id`;
- transaction has `accepted_offer_id`;
- transaction has `originating_buyer_lead_id` or `originating_lead_id`;
- lead has `converted_transaction_id`;
- buyer onboarding record exists when onboarding is sent;
- buyer onboarding prefill exists when offer facts were available;
- transaction event and workflow audit rows exist when the environment supports
  those tables.

## Forbidden Ambiguity

These labels must not be used as implementation shorthand:

- `buyer lead -> transaction`, unless the accepted-offer or override boundary is
  named in the same context.
- `send buyer onboarding`, when the action actually sends an offer link.
- `listing created`, when only a seller lead or local draft exists.
- `transaction created`, when persistence has not been confirmed.
- `seller documents transferred`, when documents are still listing-scoped and no
  transaction document promotion has run.

Preferred labels:

- `Buyer Lead -> Offer -> Accepted Offer -> Transaction`
- `Send Offer Link`
- `Send Transaction Buyer Onboarding`
- `Create Listing Shell`
- `Publish Listing`
- `Convert Accepted Offer`
- `Transaction Conversion Health Check`

## Validation Checklist

Use this checklist before implementing or releasing any later phase that touches
seller lead, buyer lead, listing, offer, or transaction creation.

### Seller Lead To Listing

- Seller lead has `organisation_id`.
- Seller lead has `branch_id` or a branch fallback is explicitly documented.
- Seller lead has owner/assigned agent attribution.
- Seller onboarding can resolve the seller lead and listing shell.
- Mandate packet links back to the seller lead and listing.
- Signed mandate fallback listing creation preserves `branch_id` and `created_by`.
- Listing creation is idempotent for the same seller lead.
- Listing operational fields are not overwritten by later lead edits after
  `mandate_signed`.
- Publication draft sync is additive.
- Seller documents remain listing-scoped until transaction exists.

### Buyer Lead To Offer

- Buyer lead has `organisation_id`.
- Buyer lead has owner/assigned agent attribution.
- Buyer lead has contact details sufficient for offer communication.
- Buyer search/interest can exist without `listing_id`.
- Buyer offer flow requires or clearly captures `listing_id`.
- Phase 2 readiness is enforced by
  [Buyer Lead Offer Readiness - Phase 2](buyer-lead-offer-readiness-phase2.md):
  buyer leads without `listing_id` stay search opportunities, while offer-link
  work requires selected listing, contact, and minimum buyer intent.
- Offer captures purchase price, deposit, finance type, cash/bond split where
  applicable, expiry, and material conditions.
- Offer status is distinct from lead status.
- Offer link UI is labelled as offer work, not transaction buyer onboarding.

### Accepted Offer To Transaction

- Accepted offer status is accepted or already converted.
- No existing transaction already owns the accepted offer.
- Existing transaction reuse path is preferred over duplicate creation.
- Phase 3 hardening is enforced by
  [Accepted Offer Transaction Boundary - Phase 3](accepted-offer-transaction-boundary-phase3.md):
  accepted-offer conversion reuses only by `accepted_offer_id`, verifies the
  persisted transaction identity row, and requires a conversion receipt before
  reporting success.
- Conversion candidate status is ready before creation.
- Transaction creation uses an idempotency key.
- Transaction creation persists buyer, seller/listing, offer, agent,
  organisation, and branch linkage.
- Transaction creation records `accepted_offer_id`.
- Transaction creation records `originating_buyer_lead_id`.
- Lead conversion fields are updated only after transaction persistence is
  confirmed.
- The UI only reports success after receipt verification.

### Override Transactions

- Override requires a written reason.
- Override requires an authorised actor.
- Phase 5 override hardening is enforced by
  [Manual Override Boundary - Phase 5](manual-override-boundary-phase5.md):
  direct buyer-lead transaction creation without `accepted_offer_id` requires a
  principal/admin-style actor, a written reason, and explicit override metadata.
- Override still requires buyer, property/listing, organisation, branch, and
  assigned agent.
- Override transactions are visible in audit/health checks as override-created.
- Phase 6 lineage health is enforced by
  [Transaction Creation Lineage Health - Phase 6](transaction-creation-lineage-health-phase6.md):
  every transaction health result must identify accepted-offer conversion,
  reused conversion, manual override, or missing lineage, and manual overrides
  must expose reason, actor id, actor role, authorisation marker, and
  idempotency key.
- Override is not the controlled-pilot default.
- Phase 7 pilot gating is enforced by
  [Controlled Pilot Lineage Gate - Phase 7](controlled-pilot-lineage-gate-phase7.md):
  controlled pilot batch evidence must carry accepted-offer creation lineage;
  manual override and missing lineage fail the batch by default.
- Phase 8 final exposure gating is enforced by
  [Final Controlled Exposure Go/No-Go - Phase 8](final-controlled-exposure-go-no-go-phase8.md):
  the final pilot decision requires release certification, an open pilot
  session, staging exposure evidence, and a green two-transaction dry run whose
  creation lineage is accepted-offer-only, confirmed, and audit visible.

### Party And Document Readiness

- Multi-buyer, spouse, company, trust, trustee, director, foreign buyer, and
  signatory facts are not collapsed into one `buyer_id` when transaction
  documents or signing need distinct parties.
- Phase 4 readiness is enforced by
  [Party Document Readiness - Phase 4](party-document-readiness-phase4.md):
  special parties stay distinct participant requirements, and FICA,
  authority, proof-of-funds, title, bond, director, trustee, and spouse-consent
  gates require upload evidence before they satisfy transaction documents.
- Existing seller bond/cancellation facts activate cancellation workflow inputs.
- Seller document promotion is idempotent and does not duplicate transaction
  document rows.
- Buyer proof-of-funds and FICA documents are real uploads before they satisfy
  transaction document gates.
- OTP/signing state is separate from offer acceptance and transaction creation.

## Phase 0 Acceptance Criteria

Phase 0 is complete when:

- this contract is linked from seller lead/listing, buyer onboarding/offer, and
  MVP transaction boundary docs;
- every later phase references the accepted-offer transaction boundary;
- product and UI copy avoids the forbidden ambiguous labels above;
- implementation phases use the validation checklist before changing runtime
  transaction creation behavior.
