import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const registrySource = readFileSync(new URL('../src/pages/transaction-workspace/datasetRegistry.js', import.meta.url), 'utf8')

for (const tabBundle of ['TasksWorkspaceTab', 'ActivityWorkspaceTab', 'RolePlayersWorkspaceTab']) {
  assert.match(detailSource, new RegExp(`import\\('./transaction-workspace/tabs/${tabBundle}'\\)`), `${tabBundle} should remain a lazy tab bundle.`)
}

for (const dataset of ['activity', 'documents', 'finance', 'partners', 'workflow']) {
  assert.match(registrySource, new RegExp(`${dataset}: \\(\\) => import\\('./datasets/${dataset}'\\)`), `${dataset} should remain an independently imported dataset.`)
}

for (const eagerDatasetLoader of [
  'fetchTransactionActivityWorkspace',
  'fetchTransactionDocumentsWorkspace',
  'fetchTransactionFinanceWorkspace',
  'fetchTransactionPartnersWorkspace',
  'fetchTransactionWorkflowWorkspace',
]) {
  assert.doesNotMatch(detailSource, new RegExp(`\\b${eagerDatasetLoader}\\b`), `${eagerDatasetLoader} must not return to the route bundle.`)
}

assert.match(detailSource, /onMouseEnter=\{\(\) => onTabIntent\?\.\(tab\.id\)\}/)
assert.match(detailSource, /onFocus=\{\(\) => onTabIntent\?\.\(tab\.id\)\}/)
assert.match(detailSource, /loadTransactionWorkspaceDataset\('documents', requestedTransactionId/)
assert.match(detailSource, /loadTransactionWorkspaceDataset\(dataset, requestedTransactionId/)

console.log('Attorney transaction workspace bundle and dataset contracts passed.')
