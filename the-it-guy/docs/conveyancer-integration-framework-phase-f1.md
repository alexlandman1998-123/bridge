# Conveyancer Phase F1 — Integration framework

## Outcome

F1 establishes the provider-neutral safety contract for future conveyancer integrations. It does not connect to a bank, deeds system, signing provider, document platform, messaging service, calendar or registry. Instead, it defines the immutable records every later adapter must use.

The framework contains four layers:

1. an adapter manifest declaring provider category, environments, authentication methods, capabilities and allowed inbound/outbound operations;
2. a controlled organisation connection holding only credential and webhook-secret references;
3. signed inbound envelopes that are accepted for reconciliation and human review; and
4. authority-bound outbound commands that are prepared but never dispatched by F1.

## Exact conveyancer binding

Every inbound event and outbound command is bound to the complete E2 identity:

- dependency-model ID and fingerprint;
- matter-plan ID and version;
- transaction and organisation;
- required professional lane; and
- the firm appointed to that lane.

The E2 model is revalidated each time. An operation cannot cross into an absent lane, another firm, organisation, transaction, plan version or altered dependency graph.

Outbound authority is limited to the appointed lane and firm. A bond attorney cannot prepare a transfer-lane command, a transfer attorney cannot act as the bond firm, and a client cannot create a provider command. A firm manager may act only inside the matching appointed firm and lane. Team-based secretary or accounts authority requires the exact appointed team.

## Adapter and connection governance

An adapter manifest is capability-based rather than provider-specific in application code. It declares exactly which event and command types it supports, the capability behind each operation, and the lanes where it is valid.

Connections are restricted by:

- organisation;
- adapter fingerprint;
- sandbox or production environment;
- enabled capabilities and lanes;
- status and verification evidence;
- credential, secret-version, endpoint and webhook-secret references;
- signing algorithm and a 60–900 second replay window; and
- purpose, legal basis, classification and retention policy.

Raw API keys, tokens, passwords, private keys and client secrets are rejected. F1 stores references only.

## Inbound safety

Inbound events require a provider event ID, idempotency key, quarantined payload reference and SHA-256 hash. The signature must be verified using the configured algorithm and webhook-secret reference, bind the same payload hash, include a hashed nonce, and arrive within the configured replay window.

An accepted event has `accepted_for_review` status. It can reconcile against evidence in later phases, but it cannot:

- approve evidence;
- mutate a workflow;
- create legal truth;
- declare registration;
- write to the database; or
- overwrite manual evidence.

This preserves the existing bond Phase 9 rule that bank and deeds signals corroborate evidence rather than manufacture it.

## Outbound safety

Outbound commands require an exact lane/firm actor, explicit authority reference, idempotency key, approved payload reference and hash, purpose, legal basis, classification and retention. F1 returns `prepared`; it does not call a provider or perform an external write.

Later phases must add a separately controlled dispatcher, provider response handling, retries and operational monitoring. Those responsibilities are deliberately outside F1.

## Idempotency and tamper evidence

An exact repeat of the same connection, direction and idempotency key is returned as a duplicate. Reusing the key with different semantic content is rejected as a conflict.

Manifests, connections, registry entries and envelopes carry deterministic fingerprints. Validation detects material changes to identity, capabilities, matter binding, payload evidence, signature evidence, authority or side-effect controls.

## Privacy and data minimisation

Inline payloads and document bodies are prohibited. Records contain only external/quarantine references, hashes and the minimum routing metadata. An event or command must stay within the connection’s approved legal basis, classifications and maximum retention period. Consent-based connections require the exact consent reference on each operation.

## Verification

Run:

```bash
npm run test:conveyancer-integrations-f1
```

The suite covers manifest and registry governance, connection verification, raw-secret rejection, signed inbound review, replay prevention, inline-payload rejection, exact E2 binding, capability isolation, inbound and outbound idempotency, actor authority, environment separation, tamper detection and the no-side-effects boundary.

## Database boundary

F1 requires no database migration. It is an in-memory contract and validation layer. Persisting adapter registrations, encrypted connection references, inbound inbox records or outbound outbox records belongs to later integration phases and must preserve these contracts.
