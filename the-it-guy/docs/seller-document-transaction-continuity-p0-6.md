# Seller document transaction continuity P0-6

P0-6 closes the handoff between the seller listing, transaction document centre, canonical transaction requirements and transferring-attorney workflow.

## Continuity contract

The listing upload remains the immutable source artifact in `private_listing_documents`. Its transaction projection in `documents` must retain:

- `source = 'seller_portal'`;
- `source_document_id` and `source_requirement_id`;
- the listing-scoped canonical ID in `source_canonical_requirement_instance_id`;
- a transaction-scoped canonical ID in `canonical_requirement_instance_id`;
- the source review status and approval timestamp; and
- an exact transaction and listing provenance link.

Uploaded or under-review evidence may be visible in the transaction but does not satisfy attorney readiness. Approval on the listing automatically projects `approved` into the shared document, transaction canonical instance and transaction-required-document projection.

A rejected replacement automatically reopens the transaction requirement and seller request. An approved seller document cannot be requested again: new matching transaction requests attach to the existing promoted document and become uploaded.

## Automatic triggers

Continuity synchronisation runs when:

1. a seller document is uploaded;
2. its review status, requirement link, canonical link or file reference changes;
3. a transaction is created or linked to the listing; or
4. an operator runs a scoped continuity repair.

Promotion is idempotent on `(transaction_id, source, source_document_id)` and never duplicates the underlying uploaded file.

## Verification

Run all seller-document phases:

```sh
npm run verify:seller-document-automation
```

After deploying P0-6, audit one organisation or transaction:

```sh
npm run audit:seller-document-continuity -- --organisation-id=<uuid> --strict
npm run audit:seller-document-continuity -- --transaction-id=<uuid> --strict
```

`blocked` means transaction or attorney handoff is unsafe. `warning` means a transaction has not yet been created or the source document still needs review. Only `pass` is attorney-handoff ready.

## Repair

Review the audit first, then repair one listing at a time:

```sh
npm run audit:seller-document-continuity -- \
  --listing-id=<uuid> \
  --repair \
  --confirm-repair
```

The repair replays every listing document through the same idempotent promotion function used by runtime triggers. It does not copy file bytes or delete source documents.
