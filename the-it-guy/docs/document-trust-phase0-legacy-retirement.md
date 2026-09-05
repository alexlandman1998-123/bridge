# Document Trust Phase 0: Legacy Retirement Register

## Purpose

Phase 0 freezes the document architecture before changing live behaviour. It records which legacy paths are still allowed, what replaces each one, and the proof required before it can be retired. It does not run a data migration, disable a live path, or delete data.

## Authoritative lifecycle

The only authoritative lifecycle for an active transaction is:

```text
document_requirement_instances.id
  -> documents.canonical_requirement_instance_id
  -> requirement status and audit event
  -> role-scoped portal projection
```

`transaction_required_documents` is a compatibility projection during the migration. It must not become an independent source of truth. `document_requests` remains the operational layer for an explicitly requested additional document; it is not evidence that a core requirement is satisfied.

## Retirement register

| ID | Legacy path | Classification | Temporary boundary | Retirement evidence | Owner | Target phase |
| --- | --- | --- | --- | --- | --- | --- |
| `legacy-required-document-projection` | `transaction_required_documents` | Bridge temporarily | It mirrors canonical requirements and preserves existing upload/review state. | Every active row has a canonical requirement link or is retired/queued for review; all portal reads use the canonical projection. | Platform | 4 |
| `legacy-seller-listing-documents` | `private_listing_documents` and `private_listing_document_requirements` | Bridge temporarily | It remains the source of a pre-transaction seller upload until it is promoted to the transaction document. | Seller upload, promotion, review, retry, and transaction creation pass without a skipped promotion. | Seller workflow | 2 |
| `legacy-client-document-matching` | `ClientDocumentCentre` and `clientPortalWorkspaceService` key/type/category matching | Replace now | Compatibility matching may explain a historic file to staff but cannot set a client-facing requirement status. | Every rendered requirement has an explicit linked document or a visible unresolved state. | Client portal | 4 |
| `legacy-client-request-container-fallback` | Client payloads without `documentRequestContainers` | Bridge temporarily | Older payloads may render a clearly labelled compatibility view only. | Telemetry reports zero fallback reads for 14 days after active-transaction migration. | Client portal | 4 |
| `legacy-seller-generator` | Seller requirement generators that do not emit the full canonical policy | Replace now | New scenarios must resolve through the canonical request planner. | Seller scenario matrix has no missing canonical policy containers. | Seller workflow | 1 |
| `legacy-upload-link-soft-failure` | Upload flows that log and continue when canonical linking cannot occur | Replace now | Physical storage may remain, but the upload must be recorded as an unresolved exception, never as complete. | Buyer and seller failure simulations create an observable repair item and never report completion. | Platform | 1 |
| `additional-document-requests` | `document_requests` | Keep, bounded | It represents a human-created extra request and must link to a canonical document when satisfied. | Additional-request upload/review has an explicit document link and does not duplicate a core requirement. | Transaction operations | 3 |

## Freeze rules

Until a register row is retired:

1. Do not add a new client-facing document checklist, upload table, or status vocabulary.
2. Do not delete legacy requirement or document rows. Retire them by disabling and hiding only after verification.
3. Do not allow a fallback matcher to mark a requirement uploaded, reviewed, or approved.
4. Every new upload path must carry a transaction ID, canonical requirement ID, document ID, actor, timestamp, and audit event.
5. A failed promotion or canonical link is an operational exception, not a successful upload.

## Phase exit gate

Phase 0 is complete only when:

- every known legacy document path is in this register;
- each row has a classification, owner, replacement boundary, retirement evidence, and target phase;
- the authoritative lifecycle above is unchanged by compatibility projections; and
- the register verification command passes.

## Verification

Run from `the-it-guy/`:

```bash
npm run verify:document-trust-phase0
```

The command is repository-only and read-only. It does not connect to Supabase or mutate document data.
