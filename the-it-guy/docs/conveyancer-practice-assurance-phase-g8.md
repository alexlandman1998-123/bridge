# Superseded assurance draft

This early assurance draft was created before the original G-series phase map was recovered. The agreed G8 is now implemented as the client/professional portal in `conveyancer-external-portal-phase-g8.md`; complete practice assurance is implemented correctly as G10 in `conveyancer-practice-assurance-phase-g10.md`.

G8 is the release-certification and controlled-pilot boundary for G1–G7. It proves that one immutable release candidate passed the complete attorney-practice contract suite, preserves professional authority and can be operated manually before external providers are onboarded. It performs no deployment or workflow action.

## Release checkpoints

Every phase from G1 through G7 must provide exactly one checkpoint bound to the same release candidate, build, source commit, environment, organisation and attorney firm. Checkpoints require their exact phase contract version, the minimum regression scenario count, zero failures and skips, immutable evidence references and independent firm-manager review.

All checkpoints prove contract validation, tenant and matter binding, authority separation, human approval, access isolation, manual/integration equivalence, reference-only evidence, tamper detection and the declared side-effect boundary. Open exceptions block release.

G8 also revalidates the published G7 configuration fingerprint and requires the G7 checkpoint to reference that exact configuration.

## Manual-first readiness

Release does not depend on banks, SARS, municipalities, community schemes, practice-management vendors or Deeds providers. A firm must demonstrate working manual paths for:

- evidence capture;
- correspondence filing;
- compliance review;
- trust reconciliation; and
- matter supervision.

The F-series integrations remain optional accelerators. Their absence does not block G8; a missing manual path does.

## Decisions and pilot

- `ready`: all seven checkpoints, configuration binding and manual paths pass.
- `observe`: no safety failure exists, but an operational warning remains.
- `blocked`: coverage, binding, authority, access, human-approval, trust, privacy, integrity or manual-readiness assurance fails.

The pilot requires 100% expected scenario outcomes and zero contract, binding, authority, access, approval, trust, privacy, side-effect or silent-configuration-rewrite failures. A small manual backlog may be observed; a larger backlog holds the pilot.

The manifest limits a pilot to three firms and 25 matters, requires named assurance, legal, operations, compliance, trust, privacy, support and rollback owners, plus a kill switch. External providers and production credentials remain disabled.

## Exit gate

G8 is complete when a release candidate can produce a `ready` assurance decision and a controlled pilot can produce `go` without needing an external provider. Durable checkpoint storage, runtime telemetry, approval screens, deployment automation and the actual kill switch remain productisation responsibilities.

No database migration is required for this in-memory assurance contract.
