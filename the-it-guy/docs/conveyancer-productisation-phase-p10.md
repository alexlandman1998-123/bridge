# Conveyancer productisation — P10 quality assurance

P10 supplies one fail-closed assurance contract and one complete regression command for P0–P9. It does not declare production readiness merely because code builds: every mandatory case needs passing, hash-addressed evidence and production requires independent release approval.

## Coverage

- P0 governance and continuity baseline.
- P1 cross-firm isolation and immutable evidence.
- P2 deterministic plan generation and command idempotency.
- P3 projection-only cockpit mutation boundaries.
- P4 notification failure and manual continuity.
- P5 document approval, release, signing and evidence authority.
- P6 secret containment and reference-only provider operations.
- P7 retry, replay, dead-letter and reconciliation recovery.
- P8 scoped kill switches, three-person approval and single-use activation.
- P9 one-next-action usability, deliberate legal review, semantics, keyboard use and responsive layouts.
- Full workflow operation without live banks, SARS, municipalities or Deeds providers.
- Production bundle assurance.

## Release rule

Every catalog case is mandatory. Missing, failed, blocked, not-run, stale or weakly evidenced cases close the gate. Production QA must be approved by someone other than the executor. The resulting QA reference, evidence hash and fingerprint can be attached directly to the P8 release candidate.

Run the complete automated contract with:

```sh
npm run test:conveyancer-productisation-p10
```

With a local or staging build running, execute the desktop/mobile entry smoke with:

```sh
P10_BASE_URL=http://127.0.0.1:5176/ npm run verify:conveyancer-productisation-p10-browser
```

Browser, responsive, keyboard and target-environment database cases must attach evidence from the actual staging build; the executable model intentionally refuses an unevidenced “passed” result. P10 adds no database migration.
