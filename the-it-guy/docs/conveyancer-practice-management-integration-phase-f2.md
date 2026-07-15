# Conveyancer Phase F2 — Practice-management integration

## Outcome

F2 adds the first concrete integration family on top of F1: a vendor-neutral practice-management adapter, governed field mappings, verified matter links and a review-first synchronization planner.

It supports controlled reconciliation of:

- matter metadata;
- party and contact references;
- tasks;
- document metadata; and
- financial summaries.

F2 does not connect to or write into a live practice-management system. It produces signed inbound provenance, review decisions and prepared F1 outbound commands that later provider adapters can dispatch.

## Vendor-neutral adapter

`buildPracticeManagementAdapterManifest` creates an F1 manifest in the `practice_management` category. The adapter declares three capabilities:

- receive a signed practice-management snapshot;
- prepare a practice-workspace synchronization batch; and
- prepare a matter-link request.

The same contract can be implemented by different PMS vendors without allowing vendor field names or API behavior to leak into the conveyancer workflow model.

## Governed field mapping

A mapping profile belongs to one active F1 connection, environment, professional lane and firm. It maps a provider field to a defined canonical field and declares:

- synchronization direction;
- configured source of authority;
- conflict policy;
- data classification; and
- whether the field is required.

Every profile requires a PMS matter-reference mapping and a platform matter-status mapping. It must be approved by a firm manager for the same lane and firm.

The canonical library covers matter reference, description, status, opening date, responsible professional, party/contact references, task keys/status/dates, document reference/status and ledger summary metadata.

## Protected fields

Identity-like, responsible-professional and financial fields are restricted. Their configured authority must remain `manual_review`, with either `manual_review` or `no_overwrite` conflict handling.

F2 deliberately has no `newest_wins` policy. A newer provider timestamp cannot overwrite legal, identity, deadline or financial truth.

## Verified matter link

A PMS matter link retains the exact:

- E2 dependency-model ID and fingerprint;
- plan ID and version;
- transaction and organisation;
- F1 connection and mapping fingerprints;
- appointed lane and firm;
- external matter-reference evidence; and
- verifying professional and timestamp.

Verification must be performed by an authorised professional inside the appointed lane and firm. The link is evidence of an exact match; creating it does not write to the PMS, mutate the platform matter or invite anyone.

## Reference-only observations

Synchronization observations contain field keys, record keys, versions, timestamps, value references and SHA-256 hashes. Inline values, display values, document bodies and content are rejected.

This lets F2 decide whether two mapped values agree without copying client names, contact details, documents or ledger contents into the integration plan.

## Reconciliation decisions

For every mapped observation pair, F2 emits one of:

- `in_sync` when hashes match;
- `import_for_review` when provider data may be brought into the platform;
- `export_prepared` when platform-authoritative metadata may be sent out;
- `conflict_review` when a human must choose the legal source of truth; or
- `ignored` when the configured direction prohibits the change.

Provider observations always require exact lineage to a signed F1 `practice_snapshot_received` event—even when their hashes match the platform. Imports never mutate the platform automatically.

If exports exist, F2 prepares one idempotent F1 `practice_sync_batch_requested` command. The command is authority-bound to the appointed firm and lane and retains only an approved batch reference and hash. F2 does not dispatch it.

## Idempotency and assurance

Outbound batches inherit F1 idempotency. Repeating an identical batch is a duplicate; reusing the key for changed content is blocked.

Profiles, matter links and sync plans carry deterministic fingerprints. Validation detects mapping, matter, firm, source-event, action, count, command and side-effect tampering.

## Verification

Run:

```bash
npm run test:conveyancer-integrations-f2
```

The suite covers adapter governance, mapping approval, protected-field policies, matter-link authority, E2 isolation, signed inbound provenance, reference-only comparison, imports, exports, conflicts, synchronized state, unmapped and duplicate observations, F1 command idempotency and tamper detection.

## Database boundary

F2 requires no database migration. Mapping profiles, matter links, normalized observations, inbox events, review decisions and outbound batches remain in-memory contracts. Durable storage, encryption, provider OAuth, polling/webhooks, dispatch, retries and vendor-specific adapters belong to later phases.
