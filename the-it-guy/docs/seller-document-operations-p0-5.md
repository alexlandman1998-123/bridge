# Seller document automation P0-5 operations

P0-5 is the release and fleet-reconciliation layer for the automatic seller document sequence. It detects files that can look complete while still having a missing request, unapproved evidence, an invalid document link, or an unresolved operational exception.

## Release gate

Run the local contract tests first:

```sh
npm run verify:seller-document-automation
```

After migrations P0-1 through P0-5 have been deployed, run the environment audit:

```sh
npm run audit:seller-document-operations -- --organisation-id=<uuid>
```

Use strict mode for a release decision. Strict mode requires every visible listing to be healthy; attention rows also fail the gate.

```sh
npm run audit:seller-document-operations -- --organisation-id=<uuid> --strict
```

The audit is read-only. A blocked report must be investigated before broad rollout.

## Health states

- `blocked`: false completion, cross-listing linkage, canonical mismatch, completed onboarding without a requirement matrix, or a required seller request that was not issued.
- `attention`: rejected evidence awaiting replacement, overdue requests, or received evidence awaiting review.
- `healthy`: every required request is issued and every completion has approved, listing-scoped evidence.

An uploaded document is received, not satisfied. Approval or completion is required before workflow readiness.

## Reconciliation

Always capture and review a dry-run report before applying repairs. Apply mode is deliberately scoped and requires two explicit flags:

```sh
npm run audit:seller-document-operations -- \
  --organisation-id=<uuid> \
  --apply \
  --confirm-apply
```

Apply mode also requires `SUPABASE_SERVICE_ROLE_KEY`; ordinary authenticated users can audit their organisation but cannot run cross-record repairs.

For the narrowest repair, use `--listing-id=<uuid>`. The reconciliation RPC:

1. quarantines cross-listing requirement links without deleting uploaded files;
2. clears invalid canonical associations;
3. synchronises approved evidence and pending-review states;
4. reopens false completions;
5. reissues seller-visible requests missing delivery metadata; and
6. writes the before/after evidence and change counts to `seller_document_reconciliation_runs`.

Requirement matrices missing after completed onboarding must be regenerated through the application requirement-sync path because applicability depends on the full seller fact model. P0-5 flags these as blockers instead of inventing incomplete requirements in SQL.

## Rollout order

1. Deploy migrations `202607170002`, `202607170005`, `202607170008`, `202607170010`, and `202607170011` in order.
2. Run a non-strict audit for one organisation.
3. Review blocked and attention listings.
4. Apply only scoped, reviewed repairs.
5. Regenerate any missing matrices through the listing requirement sync.
6. Rerun the strict audit.
7. Enable broad seller-document automation only when the gate passes.
