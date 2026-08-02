import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_VERSION,
  buildCanonicalDocumentRequestRecalculationPlan,
  resolveCanonicalDocumentRequestRecalculationDryRun,
  runCanonicalDocumentRequestRecalculationBatch,
} from '../documentRequestCanonicalAdminRecalculationService.js'

test('phase 8 recalculation defaults to dry-run unless commit is explicit', () => {
  assert.equal(resolveCanonicalDocumentRequestRecalculationDryRun(), true)
  assert.equal(resolveCanonicalDocumentRequestRecalculationDryRun({ dryRun: false }), true)
  assert.equal(resolveCanonicalDocumentRequestRecalculationDryRun({ commit: true }), false)
  assert.equal(resolveCanonicalDocumentRequestRecalculationDryRun({ commit: true, dryRun: true }), true)
})

test('phase 8 recalculation plan dedupes transaction ids and enforces batch limit', () => {
  const plan = buildCanonicalDocumentRequestRecalculationPlan({
    transactionIds: ['tx-1', ' tx-1 ', '', 'tx-2'],
  })

  assert.equal(plan.version, DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_VERSION)
  assert.deepEqual(plan.transactionIds, ['tx-1', 'tx-2'])
  assert.equal(plan.dryRun, true)
  assert.equal(plan.commit, false)

  assert.throws(
    () =>
      buildCanonicalDocumentRequestRecalculationPlan({
        transactionIds: ['tx-1', 'tx-2'],
        maxTransactions: 1,
      }),
    /limited to 1 transactions/,
  )
})

test('phase 8 recalculation batch isolates transaction failures and summarizes results', async () => {
  const calls = []
  const summary = await runCanonicalDocumentRequestRecalculationBatch({
    transactionIds: ['tx-1', 'tx-2', 'tx-1'],
    options: {
      commit: true,
      audience: 'auto',
      requestPendingPolicy: true,
    },
    async syncTransaction(transactionId, options) {
      calls.push({ transactionId, options })
      if (transactionId === 'tx-2') throw new Error('sync unavailable')
      return {
        synced: 3,
        rows: [{ document_key: 'seller_id_document' }, { document_key: 'rates_account' }, { document_key: 'bond_statement' }],
        derivedAudience: 'seller',
      }
    },
  })

  assert.deepEqual(
    calls.map((call) => call.transactionId),
    ['tx-1', 'tx-2'],
  )
  assert.equal(calls[0].options.dryRun, false)
  assert.equal(calls[0].options.audience, 'auto')
  assert.equal(calls[0].options.requestPendingPolicy, true)
  assert.equal(summary.version, DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_VERSION)
  assert.equal(summary.dryRun, false)
  assert.equal(summary.commit, true)
  assert.equal(summary.total, 2)
  assert.equal(summary.completed, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.skipped, 1)
  assert.equal(summary.synced, 3)
  assert.equal(summary.rows, 3)
  assert.equal(summary.results[1].reason, 'sync_failed')
})
