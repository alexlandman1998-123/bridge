# Attorney release readiness — Phase 7 final gate

## Objective

Turn the completed Phase 6 stabilisation evidence into a fail-closed release decision and, only after explicit accountable approval, an immutable `GO` receipt. Phase 7 does not deploy or change production state.

## Required evidence

- Phase 6 status is `STABILIZED` for the current Phase 5 ledger.
- Phase 5–6 artifact fingerprints and live propagation checks pass.
- The cumulative attorney release test suite passes.
- A fresh production build succeeds.
- The release owner approves the exact Phase 7 fingerprint with an approval reference and the confirmation `AUTHORIZE_ATTORNEY_RELEASE`.

## Preflight

```bash
npm run check:attorney-release-phase7
```

The command refreshes Phase 6 observation evidence, reruns the Phase 6 decision, executes the cumulative test suite, builds the application, and writes a fingerprinted report to `output/attorney-release/phase7-preflight.json`.

Do not treat `--skip-local-gates` as release evidence. It exists only for diagnosis and deliberately produces `NO_GO`.

## Approval and immutable receipt

After every other blocker is clear, copy `docs/attorney-release-phase7-approval.example.json` to the private output area, insert the exact preflight fingerprint, and record the accountable approval. Then run:

```bash
npm run check:attorney-release-phase7 -- --approval=output/attorney-release/phase7-approval.json --emit-receipt
```

The receipt is created once with read-only permissions. Existing receipts are never overwritten. Receipt creation is not deployment authorization beyond the explicitly approved release fingerprint.

## Current result — 2026-09-05

The implementation gate, cumulative tests, production build, artifact integrity, and live propagation checks pass. Phase 7 correctly returns `NO_GO` because Phase 6 remains `HOLD` and no final release-owner approval has been supplied.

Current release fingerprint: `aa603f052c3fde8a9e2bc66a13d4e7eb1b7ee71ed07124fc3925b2f0954b62b9`.
