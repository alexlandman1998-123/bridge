# Attorney release — Phase 4 canonical fixture repair

## Objective

Apply the guarded Phase 3 reconciliation only to deterministic attorney fixtures, then prove propagation, visibility, access isolation, and idempotency before any genuine matter is considered.

## Applied result

- Five affected transactions from the six canonical fixtures.
- Fourteen professional-shared projections repaired.
- Global propagation gaps reduced from 143 to 129.
- All six canonical fixtures now report zero propagation gaps.
- No client-visible projection was created or changed.

## Independent verification

Run `npm run verify:attorney-release-demo-phase4` for the read-only verification. Add `-- --verify-idempotency` only when the staging recovery confirmation is present; this repeats transaction-specific reconciliation and must repair zero rows.

The verified second pass covered all six fixtures, repaired zero additional projections, and left global health unchanged at 129 gaps.

Each managed attorney actor also authenticated through the anonymous client and could read its assigned seeded role only:

- Transfer attorney: six assignments, zero other-role assignments.
- Bond attorney: three assignments, zero other-role assignments.
- Cancellation attorney: three assignments, zero other-role assignments.

## Evidence

- Apply receipt: `output/attorney-release/phase4-demo-apply-receipt.json`
- Verification receipt: `output/attorney-release/phase4-demo-verification.json`

Both receipts use redacted record keys, owner-only permissions, and content fingerprints. They contain no raw transaction UUIDs, credentials, or client data.

## Exit criteria

- Fourteen expected repairs and no extras.
- Zero remaining fixture gaps.
- Repaired visibility is exclusively `professional_shared`.
- Actor role isolation passes.
- Second reconciliation pass repairs zero rows.
- The remaining backlog is reclassified before genuine-matter approval.
