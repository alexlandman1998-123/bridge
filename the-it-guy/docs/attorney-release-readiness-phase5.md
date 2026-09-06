# Attorney release readiness — Phase 5 release candidate

## Objective

Turn Phases 0–4 into one fail-closed release decision. Phase 5 does not deploy or mutate production data.

The controlled staging-data remediation that precedes this release-candidate gate is documented in [attorney-release-genuine-remediation-phase5.md](./attorney-release-genuine-remediation-phase5.md). It completed with zero remaining propagation gaps.

## GO requirements

All conditions must pass against the same source fingerprint:

- Cumulative Phase 1–4 automated gate and production build.
- Authenticated, active transfer, bond, and cancellation attorney staging actors.
- Deterministic attorney staging fixtures.
- Healthy propagation with zero unexplained gaps.
- Desktop and mobile workflow walkthroughs for all three attorney roles.
- Verified updates in the attorney matter, transaction workspace, attorney operations, agent view, buyer portal, and seller portal.
- Accountable release-owner approval recorded after the evidence is complete.

## Runbook

1. Run `npm run check:attorney-release-phase5:staging`. The first run is expected to return `NO_GO` and prints the current `sourceFingerprint` plus exact blockers.
2. Copy the browser evidence and approval examples, complete every check, and replace `COPY_FROM_PHASE5_PREFLIGHT` with that fingerprint.
3. Configure `ATTORNEY_RELEASE_BROWSER_EVIDENCE_FILE` and `ATTORNEY_RELEASE_APPROVAL_FILE` with paths relative to the application root.
4. Rerun the command. Release only when the report returns `status: GO`.

Use `--skip-local-gates` only for fast diagnosis. A skipped code or build gate deliberately remains `NO_GO` and cannot create a release approval.

## Evidence integrity

The fingerprint covers the Phase 0–5 release contract, workflow services, propagation mapping, and core attorney interaction surfaces. Any relevant source change invalidates browser evidence and approval automatically.

Do not put passwords, tokens, client data, or service-role keys in either evidence file. Store only test references or redacted artifact locations.
