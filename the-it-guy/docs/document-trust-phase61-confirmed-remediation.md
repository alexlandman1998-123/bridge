# Document trust — Phase 6.1 confirmed remediation

Phase 6.1 turns the Phase 6 release blockers into a review queue. It does not guess document matches from names, categories, document keys, or timestamps.

## Safe workflow

1. Produce a read-only queue for active buyer-portal transactions.
2. A reviewer verifies the exact same-transaction pair in the operational workspace.
3. Apply only that explicit pair with a change/ticket reference.
4. The atomic database operation records a canonical lifecycle event and the command writes a JSON receipt.
5. Re-run the Phase 6 assurance report.

```sh
# Review only — no database writes.
npm run report:document-trust-phase61

# Link a reviewer-selected document to a broken canonical requirement.
node scripts/document-trust-phase61-confirmed-remediation.mjs \
  --apply \
  --confirm-phase61-remediation \
  --actor-reference=CHANGE-123 \
  --requirement-document=<requirement-uuid>:<document-uuid>

# Link a reviewer-selected legacy row to a canonical requirement.
node scripts/document-trust-phase61-confirmed-remediation.mjs \
  --apply \
  --confirm-phase61-remediation \
  --actor-reference=CHANGE-123 \
  --legacy-requirement=<legacy-row-uuid>:<requirement-uuid>
```

The migration must be deployed before `--apply` is available. Every write is rejected unless the selected records are in the same transaction, the target remains a live review item, and neither record is already linked to a conflicting canonical record.

If a requirement already references a document linked to another requirement, the queue marks it as a conflict. It is deliberately manual-only: Phase 6.1 will not overwrite either side of that lifecycle history.

## Verification

```sh
npm run test:document-trust-phase61
npx vitest run src/services/__tests__/documentTrustPhase61RemediationService.test.js
```
