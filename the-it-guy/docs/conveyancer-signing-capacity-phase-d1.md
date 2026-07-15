# Conveyancer Signing Capacity — Phase D1

## Purpose

D1 establishes the legal capacity contract that must be satisfied before a person can sign a governed document for a party. It separates a signer's identity from the authority under which that signer acts.

The executable model is `src/core/documents/conveyancerSigningCapacityModel.js`.

## Capacity matrix

The model covers:

- natural persons signing for themselves or as co-owners;
- spouses giving consent;
- company directors and close-corporation members;
- trustees;
- executors of deceased estates;
- attorneys acting under a power of attorney;
- guardians and curators;
- delegated entity and bank representatives;
- appointed conveyancers and commissioners; and
- independent witnesses.

Each capacity has an exact permitted party type, party role, authority basis and evidence bundle. An incompatible combination is structurally invalid and fails closed.

## Authority evidence

Evidence is stored as opaque references and hashes rather than document content or personal data. Each item records its status, validity period, source and verifier.

Missing or pending evidence makes a capacity `incomplete`. Rejected, conflicting or expired evidence makes it `blocked`. The record becomes `ready` only when its full evidence bundle and authority period are valid.

High-risk representative capacities require independent verification by a legal user authorised for the transfer, bond or cancellation lane. A secretary may capture the record and supporting evidence but cannot perform that legal verification.

## Document applicability

A ready capacity is usable only when all of these bindings match:

- matter plan and version;
- transaction and organisation;
- legal lane;
- party role;
- document key or document kind;
- the explicit `sign_documents` power; and
- the authority's effective period.

This evaluation is intended to become a prerequisite for C7 signing preparation in a later integration phase. D1 does not change C7 automatically.

## Integrity and corrections

Every normalized record carries a deterministic fingerprint. Validation recomputes both the fingerprint and assessment so altered scope, authority or evidence cannot be silently accepted.

Corrections use append-only lineage: the next version must be sequential, bind to the previous record ID and fingerprint, preserve the matter, party and signatory identity, and state a change reason. The original record remains immutable.

## Privacy and phase boundary

The contract contains stable party and signatory keys plus a hashed signatory reference. It does not retain names, email addresses, identity numbers, document contents or evidence storage locations.

D1 is an in-memory domain contract. It does not persist evidence, alter signing requests, call an identity provider, verify a real authority document or provide a user interface. No database migration is required.
