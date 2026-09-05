# Document Trust Phase 2: Active Transaction Migration

Phase 2 migrates active portal-facing transactions away from visible legacy required-document rows. It wraps the existing guarded legacy cleanup runner with a document-trust gate.

## Controls

- Dry-run is the default.
- Scope is capped at 25 active transactions.
- Canonical portal parity must pass before any row is eligible.
- Rows with uploaded, reviewed, rejected, or verified evidence are placed in a review queue and cannot be disabled automatically.
- Eligible zero-state legacy rows are disabled and hidden; they are never deleted.
- The operation never writes `document_requests`.
- A commit requires both Phase 2 confirmation and the underlying cleanup confirmation.
- Commit mode always runs a fresh dry-run first and refuses to write if canonical parity fails or the review queue is non-empty.

## Commands

Dry-run:

```bash
npm run run:document-trust-phase2
```

Controlled commit, after reviewing the generated review queue:

```bash
node scripts/document-trust-phase2-active-migration.mjs \
  --commit \
  --confirm-phase2-active-migration
```

## Exit gate

The phase completes only when the postcheck reports no active legacy keys, zero failed updates, zero review-queue rows, and canonical portal parity.
