# Conveyancer Signing — Phase D2

## Purpose

D2 turns governed document signing fields and D1 capacity records into one controlled signing plan. It answers who must sign, for which party, under which authority, against which field, by which method and in what order.

The executable contract is `src/core/documents/conveyancerSigningPlan.js`.

## Exact source binding

Every plan binds to one C4 document and records its:

- document and matter-plan identity;
- transaction, organisation, action and legal lane;
- document key and kind;
- content and provenance fingerprints; and
- required signature and initial fields.

Changing the source identity, fingerprints or signing fields changes the plan fingerprint and requires a new plan revision.

## Participants and capacity

A participant contains only stable party and signer keys, a hashed signer reference, the document signer role and an exact D1 capacity binding. Readiness revalidates the supplied D1 record and checks that:

- the signatory, party, role and reference hash match;
- the capacity applies to this exact document and matter;
- the authority is complete, verified and currently effective; and
- the signer is permitted to exercise `sign_documents`.

Missing capacity makes the plan `incomplete`. Invalid, conflicting or expired authority makes it `blocked`.

## Field coverage and quorum

Every required signature or initial field must have enough assigned signers of the field's required role. Automatic assignment maps matching participants to fields, while explicit assignments support:

- all named signers;
- any one named signer; or
- an at-least quorum, such as two of three trustees.

This makes multiple owners and collective entity authority explicit rather than collapsing them into one generic seller or buyer role.

## Routing and methods

The plan supports:

- parallel signing in one order group;
- strictly sequential signing with one signer per group; and
- mixed routing with parallel signers inside contiguous ordered groups.

Each participant is restricted to electronic signing, wet ink or both. Unsupported methods, order gaps and incompatible routing rules fail structurally.

## Legal approval and C7 projection

A secretary may prepare a plan. Only a legal user authorised for the transfer, bond or cancellation lane may approve it. The readiness outcomes are:

- `incomplete` — signer, field or capacity information is missing;
- `blocked` — an authority or coverage conflict exists;
- `review_required` — coverage is complete but legal approval is outstanding; and
- `ready` — the complete plan is legally approved and may be projected to C7.

The C7 projection contains only the signer key, document role, signer-reference hash, order, required flag and permitted methods. Projection fails closed unless D2 is currently `ready` and all D1 records are supplied and valid.

## Integrity and corrections

The normalized plan and assessment are fingerprinted. Append-only correction lineage requires a sequential revision, the previous plan ID and fingerprint, an explicit reason, and an unchanged source-document identity.

## Privacy and phase boundary

D2 does not retain signer names, contact details, identity numbers, document contents or authority-document locations.

D2 builds and validates an in-memory plan. It does not modify C7, render a document, create a signing envelope, dispatch a signing request, persist records or call a signing provider. No database migration is required.
