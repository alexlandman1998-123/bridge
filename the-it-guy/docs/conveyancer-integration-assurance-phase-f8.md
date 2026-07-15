# Conveyancer Phase F8 — Integration assurance

## Outcome

F8 is the release-certification boundary for F1-F7. It proves that one immutable release candidate passed every integration contract suite, that its configured adapter and connection inventory is valid, and that controlled pilot evidence supports deployment. It does not repeat the underlying business workflows or perform a deployment.

## Phase checkpoints

Every phase from F1 through F7 must supply exactly one immutable checkpoint bound to the same:

- release candidate;
- build identifier;
- source commit;
- environment; and
- organisation.

Each checkpoint carries the exact phase contract version, the minimum regression scenario count, zero failures, zero skipped scenarios, a hashed evidence reference, adapter fingerprints and independent manager review.

The following probes must all pass:

- contract validation;
- exact matter binding;
- exact appointed-firm binding;
- idempotency conflict handling;
- inbound signature and replay protection;
- reference-only payload handling;
- side-effect boundaries; and
- tamper detection.

Open checkpoint exceptions block certification.

## Concrete inventory assurance

F8 revalidates the actual F1 adapter manifests and provider connections. It requires provider coverage for practice management, trust accounting, SARS/transfer duty, municipal or community-scheme clearance, banking and deeds progression. Each F2-F7 checkpoint must reference an adapter fingerprint from its own provider category.

Invalid, duplicate or orphaned inventory blocks release. A valid but inactive connection produces an observation rather than production certification.

## Decisions

- `ready`: all seven checkpoints, bindings and active inventory pass without findings.
- `observe`: contracts remain valid but an operational warning, such as an inactive connection, remains.
- `blocked`: any coverage, contract, binding, authority, privacy or integrity failure exists.

## Pilot gate

The pilot defaults are deliberately strict: 100% scenario success and zero contract failures, binding failures, accepted replay attempts, signature failures, privacy incidents, side-effect attempts or unresolved idempotency conflicts. A small reconciliation backlog can be observed; a larger backlog holds the pilot.

The pilot manifest limits the initial scope to three firms and 25 matters, requires named assurance, legal, operations, security, privacy, support and rollback owners, and requires a kill switch. Production credentials, automatic deployment, external writes, money movement, notifications and registration mutation remain disabled.

## Evidence and persistence

The serializer emits only release metadata, findings, counts, thresholds and guarded scope. It excludes credentials, payloads and party data.

No database migration is required. F8 is an immutable in-memory certification contract. Durable checkpoint storage, CI attestations, deployment approvals, operational telemetry and the kill-switch implementation belong to the controlled release pipeline.
