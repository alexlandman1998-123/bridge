# Conveyancer Document Templates — Phase C8

## Purpose

C8 provides independent assurance and a guarded pilot for the complete C1-C7 legal-instrument chain. It answers two separate questions:

1. Is the platform evidence trustworthy and internally complete?
2. Has this particular signing run reached a completed signed-document outcome?

The executable service is `src/services/attorneyWorkflow/conveyancerLegalInstrumentSigningAssurance.js`.

## Independent assurance

C8 revalidates, rather than trusting, the supplied records. Critical checks cover:

- an active valid A-series matter plan;
- intact C1-C5 template, data, draft and assurance controls;
- a valid C6 review contract and exact C4 document binding;
- final C6 approval with an approval fingerprint;
- a complete, ordered and independently authorised C6 audit chain;
- a valid C7 signing and document-evidence contract;
- exact C7 binding to the C6 approval and C4 fingerprints;
- governed render, signer-role and identity-verification provenance;
- a continuous signature artifact-hash chain;
- final signed-document and completion-certificate integrity;
- a complete, ordered and independently authorised C7 audit chain; and
- no embedded rendering, persistence, signing or dispatch side effect.

Any structural, authority, binding, audit, identity, hash-chain or certificate failure produces `blocked`.

## Matter outcomes versus platform failures

A clean completed signing produces `ready` and is eligible for a later controlled production integration step.

A valid signing still in progress, awaiting completion evidence, declined, expired or voided produces `observe`. These are matter outcomes that need operational attention, not proof that the platform contract failed. An active signing left past its expiry date is also observed.

Assurance evidence is redacted metadata containing stable IDs, statuses and fingerprints. It excludes document content, signer names, email addresses, identity numbers, signature images and storage locations.

## Pilot scenarios

The deterministic C8 pilot covers:

- completed transfer signing with completion certificate;
- completed bond signing;
- completed cancellation signing;
- a valid signing still in progress;
- a governed signer decline; and
- a deliberately tampered signature chain that passes only when C8 blocks it safely.

This validates all three legal lanes and the `ready`, `observe` and safe-block outcomes.

## Operational thresholds and rollback

The pilot monitors:

- scenario pass rate;
- signing failure, overdue and decline rates;
- evidence-integrity failures;
- audit gaps;
- identity-verification failures;
- completion-certificate failures; and
- side-effect attempts inside the C8 boundary.

Integrity, audit, identity, certificate and side-effect failures are immediate hold conditions. Rate thresholds can be made stricter but cannot be weakened through configuration.

## Pilot manifest

The manifest limits rollout to one to three named firms, exact template versions, one or two signing providers, explicit legal lanes, five to twenty-five matters and at most ten documents per matter. Assurance, signing, rollback and support owners are mandatory.

The manifest requires webhook verification, completion certificates, human legal approval, a kill switch and a legacy signing fallback. It cannot enable database writes, automatic rendering, automatic signing-request dispatch, signature capture, completed-document dispatch or production packet integration.

## Phase boundary

C8 calculates assurance, pilot outcomes, rollout triggers and manifest validity in memory. It does not call a signing provider, verify a real webhook, write assurance rows, move files, send links, dispatch signed documents or execute rollback actions.

No database migration is required.
