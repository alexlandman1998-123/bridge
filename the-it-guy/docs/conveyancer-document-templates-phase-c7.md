# Conveyancer Document Templates — Phase C7

## Purpose

C7 creates the controlled signing and document-evidence contract for a C6-approved legal instrument. It proves which approved content was rendered, who was required to sign, how each signature changed the artifact, and which final signed document and completion certificate belong to that signing run.

The executable service is `src/services/attorneyWorkflow/conveyancerLegalInstrumentSigningEvidence.js`.

## Entry gate

Signing preparation fails closed unless:

- the C6 review contract is valid, approved and marked eligible for release;
- the supplied C4 document independently recomputes to the approved content and provenance fingerprints;
- a rendered PDF carries a SHA-256 artifact hash, version identity, renderer provenance and page count;
- the render evidence names the exact C4 document, C4 fingerprints and C6 approval fingerprint;
- the signing window starts after approval and expires within ninety days; and
- every required signer role derived from the C4 signing fields has a pseudonymous signer contract.

The C7 service records render evidence supplied by a controlled renderer. It does not render the PDF itself.

## Signing lifecycle

The lifecycle is `prepared`, `in_progress`, `awaiting_completion_evidence`, then `completed`. A signer decline, expiry or authorised void produces a terminal alternative outcome.

Signer contracts contain a stable signer key, signer role, hashed signer reference, signing order, required flag and allowed methods. They intentionally exclude names, email addresses, identity numbers and signature images.

Electronic and wet-ink evidence are supported. Each recorded signature requires:

- the signer and permitted method;
- signing and identity-verification timestamps;
- provider or custody evidence references;
- a unique provider event ID;
- a hashed identity-verification reference; and
- the exact input and output artifact hashes.

Required signing order is enforced. Every signature output becomes the next signature input, creating a continuous artifact-hash chain from the approved rendered PDF to the final signed artifact.

## Completion evidence

All required signers must be signed before completion can be recorded. Completion then requires:

- signed-document and version identities;
- the final artifact hash;
- a hashed storage reference;
- the completion-certificate hash and hashed certificate reference; and
- a provider envelope identifier.

C7 combines the immutable C6/render binding, signature evidence and signed-document evidence into a reproducible completion fingerprint. Changing the approval, signer contract, hash chain, final document or certificate invalidates the record.

## Authority and concurrency

Secretaries can prepare signing, record operational evidence and record completion in their legal lane. Conveyancers, the relevant lane attorney and firm managers can manage the lifecycle. System/provider actors can ingest evidence, record completion and expire a signing run. Only legally authorised roles can void it.

Every command carries the expected signing ID, runtime revision, immutable binding fingerprint and current artifact hash. Commands use a hashed command fingerprint for exact replay; command-ID reuse with different intent is rejected.

## Phase boundary

C7 is an in-memory, side-effect-free evidence contract. It does not render documents, create provider envelopes, send signing links, capture signatures, upload files, write database rows or dispatch completed documents. Audit events explicitly record that rendering, persistence, signing and dispatch were not performed by this service.

Integration with the existing packet, storage and external-signing services belongs to a later phase. No database migration is required for C7.
