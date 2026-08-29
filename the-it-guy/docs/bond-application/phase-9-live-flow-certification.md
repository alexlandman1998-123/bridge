# Phase 9: Authenticated live-flow certification

Phase 9 is the final fail-closed certification layer for the bond-originator assurance track. It does not claim that a live run occurred. It defines, validates and fingerprints the evidence that operators must capture from one authenticated staging run before promoting the exact tested build.

## Required staging journey

The same representative fixture and deployment artifact must complete:

1. Buyer opens the application.
2. Buyer saves a draft.
3. Buyer resumes the saved application.
4. Buyer recalculates document requirements.
5. Buyer uploads a required document.
6. Bond originator reviews the application.
7. Bond originator downloads the branded application pack.
8. Bond originator prepares the controlled handoff.

The run must also pass every scenario in the current `BOND_APPLICATION_BROWSER_E2E_VERSION` contract. Each result carries its actor, environment, fixture ID, artifact ID, observation time and trace, screenshot or report reference.

## Blocking conditions

Certification is blocked when any of the following is true:

- The environment is not staging or production was mutated.
- Buyer or bond-originator authentication evidence is absent.
- A journey step or browser-contract scenario is missing, duplicated, unknown or failed.
- Evidence came from different builds or fixtures.
- Console, API or page errors were observed.
- A second document reconciliation changes active identities or creates duplicates.
- Recalculation loses or duplicates an uploaded document.
- The branded pack download or controlled handoff has no fingerprint/idempotency evidence.
- The Phase 7 production-promotion artifact is not ready.
- The version manifest is missing or the evidence is older than four hours.

## Operator workflow

1. Create the evidence skeleton with `buildBondOriginatorLiveFlowEvidenceTemplate`.
2. Deploy the exact candidate artifact to staging.
3. Complete the full journey with authenticated buyer and bond-originator fixtures.
4. Attach browser traces/screenshots and capture console, page and API failures.
5. Run reconciliation twice and record both active identity sets and document IDs.
6. Pass the completed object to `buildBondOriginatorLiveFlowCertification`.
7. Promote only when the result is `live_certification_ready`, and attach its fingerprint to the release record.

If the build changes, repeat the entire run. Evidence from separate builds cannot be combined.

Generate a JSON evidence skeleton:

```bash
npm run certify:bond-originator-live-flow-phase9 -- --template \
  --fixture-id bond-live-fixture-1 \
  --artifact-id staging-artifact-1 \
  --output artifacts/bond-phase9-evidence.json
```

Certify completed evidence. The command exits non-zero when any check is blocked:

```bash
npm run certify:bond-originator-live-flow-phase9 -- \
  --evidence artifacts/bond-phase9-evidence.json \
  --output artifacts/bond-phase9-certification.json
```

## Verification

```bash
npm run test:bond-originator-live-flow-certification-phase9
```
