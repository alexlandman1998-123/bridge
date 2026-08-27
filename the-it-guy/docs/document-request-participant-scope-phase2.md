# Document Request Phase 2: Participant Scope

Phase 2 gives every person-specific request two identities:

- a stable request subject such as `purchaser:1` or `purchaser:2`
- a base canonical document type such as `buyer_id_document`

This prevents two purchasers' identity, address, and finance requirements from collapsing into one canonical instance while keeping document taxonomy and matching stable.

Client-facing labels include the captured name where available, for example:

```text
Purchaser 1 (Alex Buyer) — ID Document
Purchaser 2 (Taylor Buyer) — ID Document
```

A spouse who is not a purchaser is labelled as `Spouse (Name)` and is not represented as Purchaser 2.

The participant scope does not change upload ownership. Buyer-supplied documents may still be uploaded by the buyer or by an authorised agent on the buyer's behalf, with the actual uploader retained in the document audit fields.

The accompanying additive migration adds participant metadata to canonical instances and transaction document projections. Legacy checklist projections use a participant-scoped `document_key` while retaining the base type in `canonical_document_key`.
