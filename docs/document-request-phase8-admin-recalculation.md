# Document Request Phase 8: Admin Recalculation

Phase 8 adds a controlled recalculation surface for canonical document request requirements.

## What It Does

- Reuses the Phase 7 single-transaction sync path.
- Accepts one transaction id or a batch of transaction ids.
- Defaults to dry-run, so no rows are written unless `commit: true` is supplied.
- Deduplicates transaction ids before running.
- Limits normal batches to 50 transactions.
- Continues when one transaction fails and reports that transaction as `sync_failed`.
- Does not create `document_requests` rows.
- Does not send emails or client notifications.

## API

Use:

```js
await runCanonicalDocumentRequestRequirementRecalculation({
  transactionIds: ['transaction-id-1', 'transaction-id-2'],
  audience: 'auto',
})
```

That returns a dry-run summary.

To persist the recalculated `transaction_required_documents` rows:

```js
await runCanonicalDocumentRequestRequirementRecalculation({
  transactionIds: ['transaction-id-1', 'transaction-id-2'],
  audience: 'auto',
  commit: true,
})
```

If `dryRun: true` is supplied, it wins over `commit: true`.

## Result Shape

The result includes:

- `version`: `document_request_phase8_admin_recalculation_v1`
- `dryRun`
- `commit`
- `total`
- `completed`
- `failed`
- `skipped`
- `synced`
- `rows`
- `results`

Each result row includes the transaction id, success state, skipped reason, synced count, row count, and derived audience.

## Operational Rule

Run dry first and compare the summary before committing. Phase 8 is a recalculation surface only; client-facing requests and notifications remain separate on purpose.
