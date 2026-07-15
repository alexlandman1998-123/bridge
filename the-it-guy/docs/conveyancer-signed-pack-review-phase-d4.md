# Conveyancer Signing — Phase D4

## Purpose

D4 is the post-signing legal acceptance gate. C7 proves that signature events, identity evidence, the artifact hash chain and the completion certificate are technically intact. D4 decides whether the returned signed pack is complete and legally usable for the next controlled conveyancing phase.

The executable workflow is `src/services/attorneyWorkflow/conveyancerSignedPackReview.js`.

## Exact source binding

A review can start only from:

- a completed, structurally valid C7 signing record;
- a legally approved and currently valid D2 signing plan;
- an exact D2-to-C7 signer-contract match; and
- matching document, matter, transaction, organisation, lane, content and provenance fingerprints.

The review pins the C7 signing revision, binding and completion fingerprints, the D2 plan revision and fingerprint, the final signed artifact and any applicable D3 appointment fingerprints.

## Signed-pack inspection

The inspection manifest records only governed evidence and opaque hashes. It checks:

- signed document and version identity;
- final artifact and completion-certificate hashes;
- complete page count;
- every required signature and initial field;
- the signer responsible for each field;
- field status and page number;
- execution dates;
- legibility; and
- unauthorised alterations.

Each field result must refer to a known D2 field and signer and carry a hashed evidence reference.

## D2 quorum and C7 reconciliation

D4 applies the D2 field assignment and quorum to the inspected pack. This supports all-sign, any-one and at-least execution structures without reducing multiple owners, trustees or representatives to a generic role.

Required C7 signers are reconciled against D2 identity, role, order, allowed method and identity-verification evidence. Optional signers do not become mandatory merely because they appear in the plan.

## Wet-ink controls

For every wet-ink signer D4 requires:

- evidence that the original was received after signature;
- a hashed originals reference; and
- a completed D3 appointment bound to the same D2 plan where that signer attended or arrived late.

Electronic-only packs treat this control as not applicable and pass without manufacturing appointment or originals evidence.

## Findings and decisions

Every failed check creates an immutable critical or major finding. A review with findings cannot be recommended for acceptance. The conveyancer must request a corrected pack or reject it; findings cannot be manually cleared against the unchanged artifact.

A clean pack follows this lifecycle:

1. The secretary or legal team starts the inspection review.
2. A lane-authorised conveyancer acknowledges every legal-use control and recommends acceptance.
3. A lane-authorised legal user records final acceptance with a decision reference and summary.

The workflow also supports reasoned correction requests and rejection. Terminal decisions cannot be edited.

## Integrity, concurrency and privacy

The source inspection, findings and upstream bindings have a static fingerprint. Runtime status and decisions have a separate fingerprint. Commands use the review ID, revision and fingerprint to reject stale work.

Exact starts and commands are idempotent; reused command IDs with changed inputs are rejected. Audit events exclude legal summaries, document content, names, emails, identity numbers, addresses, meeting links and private evidence references.

## Phase boundary

D4 records an in-memory legal acceptance decision. It does not move or persist the signed pack, replace the C7 artifact, send correspondence, update registration readiness, submit documents to a bank or deeds office, or dispatch the accepted pack. No database migration is required.
