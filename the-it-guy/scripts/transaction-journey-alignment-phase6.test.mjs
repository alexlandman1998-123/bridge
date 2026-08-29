import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('token-scoped journey projection always uses external-safe audience copy', async () => {
  const source = await read('src/lib/api.js')

  assert.match(source, /function fetchTokenScopedTransactionJourneySnapshot\(client, transactionId\)/)
  assert.match(source, /actorRole: 'external_share'/)
  assert.match(source, /return rollup\?\.transactionJourneySnapshot \|\| null/)
  assert.doesNotMatch(source, /fetchTokenScopedTransactionJourneySnapshot\(client, transactionId, actorRole\)/)
})

test('external transaction workspace returns and renders the canonical snapshot', async () => {
  const apiSource = await read('src/lib/api.js')
  const pageSource = await read('src/pages/ExternalTransactionPortal.jsx')

  assert.match(apiSource, /fetchExternalTransactionWorkspace[\s\S]*?transactionJourneySnapshotPromise = fetchTokenScopedTransactionJourneySnapshot/)
  assert.match(apiSource, /transactionJourneySnapshot = await transactionJourneySnapshotPromise/)
  assert.match(apiSource, /documentSummary: checklistResult\.summary,[\s\S]*?transactionJourneySnapshot/)
  assert.match(pageSource, /buildTransactionJourneyPresentation\(\{ snapshot: safePortal\.transactionJourneySnapshot \}\)/)
  assert.match(pageSource, /<TransactionJourneyTracker[\s\S]*?audience="external-portal"/)
  assert.match(pageSource, /transactionJourneyModel \? \([\s\S]*?<TransactionLifecycleProgress/)
})

test('public status share returns and renders the same canonical journey', async () => {
  const apiSource = await read('src/lib/api.js')
  const pageSource = await read('src/pages/TransactionStatusShare.jsx')

  assert.match(apiSource, /fetchTransactionStatusByToken[\s\S]*?transactionJourneySnapshotPromise = fetchTokenScopedTransactionJourneySnapshot/)
  assert.match(apiSource, /transactionJourneySnapshot = await transactionJourneySnapshotPromise/)
  assert.match(pageSource, /statusData\.transactionJourneySnapshot[\s\S]*?buildTransactionJourneyPresentation/)
  assert.match(pageSource, /<TransactionJourneyTracker[\s\S]*?audience="status-share"/)
})

test('public routes keep their legacy renderer as a compatibility fallback', async () => {
  const externalSource = await read('src/pages/ExternalTransactionPortal.jsx')
  const statusSource = await read('src/pages/TransactionStatusShare.jsx')

  assert.match(externalSource, /transactionJourneyModel \? \([\s\S]*?<TransactionJourneyTracker[\s\S]*?: \([\s\S]*?<TransactionLifecycleProgress/)
  assert.match(statusSource, /transactionJourneyModel \? \([\s\S]*?<TransactionJourneyTracker[\s\S]*?: \([\s\S]*?<TransactionLifecycleProgress/)
})
