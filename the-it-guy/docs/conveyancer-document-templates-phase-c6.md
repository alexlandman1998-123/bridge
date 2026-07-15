# Conveyancer Document Templates — Phase C6

## Purpose

C6 adds a controlled human review and approval workflow for C5-assured legal-instrument drafts. It binds every decision to one immutable C4 document version and preserves the separation between document preparation, legal review and final approval.

The executable service is `src/services/attorneyWorkflow/conveyancerLegalInstrumentReview.js`.

## Review lifecycle

An intact C5 `ready` or `observe` draft may enter `pending_review`. A legally authorised reviewer can then:

- recommend approval after completing all six review controls;
- request changes with a reason and structured correction details; or
- reject the document with a recorded reason.

A recommendation moves the version to `reviewed`. A separate approval command moves it to `approved` and produces approval evidence. `changes_requested`, `rejected` and `approved` are terminal for that document version. Corrections must return to C4 generation and create a newly fingerprinted version; the rejected or returned version is never edited in place.

## Controls and warning handling

The reviewer must confirm instruction and scope, parties and capacity, property and financial data, legal wording and clauses, execution fields, and data warnings or conflicts. A control may be marked not applicable only with a reason.

Every C3 warning code carried by an observed C5 draft must be acknowledged exactly before approval can be recommended. A missing or unexpected acknowledgement fails closed.

## Authority and separation of duties

- Secretaries may submit a draft for review in their legal lane but cannot review, reject or approve it.
- Conveyancers, firm managers and the attorney role for the document lane may take legal decisions.
- Bond attorneys cannot decide transfer or cancellation documents, and equivalent cross-lane attempts are denied. Firm managers retain cross-lane authority.
- The C4 preparer cannot perform the legal recommendation or final approval.
- Final approval requires an existing legal recommendation. The reviewer and approver may be the same authorised professional, while both remain independent of the preparer.

## Integrity and audit

Submission independently reruns C5 assurance. A review binding fingerprint fixes the exact plan, template, C4 content and provenance fingerprints, C5 evidence, warnings, preparer and submission evidence. Commands carry the expected review ID, document ID, revision and both document fingerprints, preventing decisions from stale tabs or on substituted content.

Every state transition emits an immutable, redacted audit event. Final approval records a decision reference, the recommendation event ID and a separately reproducible approval fingerprint. Commands are idempotent by command ID and a hashed command fingerprint; reuse with different intent or authority fails as a conflict. Out-of-order timestamps are rejected.

## Phase boundary

`approvedForRelease` means only that the exact draft is eligible to enter a later controlled rendering or release phase. C6 does not render a file, write a packet or database record, sign a document, dispatch correspondence, or integrate with production document storage. Those side-effect flags remain disabled even after approval.

The implementation is an in-memory domain contract and requires no database migration.
