import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('buyer overview no longer renders a separate five-stage lifecycle', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.doesNotMatch(source, /TransactionLifecycleProgress/)
  assert.match(source, /model=\{buyerJourneyPresentationModel\}[\s\S]*?audience="buyer-overview"/)
})

test('professional matter header no longer duplicates the macro journey', async () => {
  const source = await read('src/pages/AttorneyTransactionDetail.jsx')

  assert.doesNotMatch(source, /TransactionLifecycleProgress/)
  assert.match(source, /audience="attorney"/)
  assert.match(source, /audience="bond-originator"/)
})

test('legacy lifecycle renderer remains limited to explicit compatibility and generic detail paths', async () => {
  const liveSources = await Promise.all([
    read('src/pages/UnitDetail.jsx'),
    read('src/pages/ExternalTransactionPortal.jsx'),
    read('src/pages/TransactionStatusShare.jsx'),
  ])

  for (const source of liveSources) {
    assert.match(source, /TransactionJourneyTracker/)
    assert.match(source, /TransactionLifecycleProgress/)
  }
})
