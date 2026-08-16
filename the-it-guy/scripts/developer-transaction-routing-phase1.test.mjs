import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { resolveTransactionWorkspaceRoute } from '../src/core/transactions/transactionWorkspaceRouting.js'

const appRoot = resolve(import.meta.dirname, '..')
const readSource = (path) => readFileSync(resolve(appRoot, path), 'utf8')

assert.deepEqual(
  resolveTransactionWorkspaceRoute({
    transactionId: 'tx-123',
    unitId: 'unit-123',
    unitNumber: '006',
    transactionReference: 'TRX-006',
  }),
  {
    kind: 'transaction',
    path: '/transactions/tx-123',
    state: { headerTitle: 'TRX-006' },
  },
)

assert.deepEqual(
  resolveTransactionWorkspaceRoute({
    unitId: 'unit-123',
    unitNumber: '006',
  }),
  {
    kind: 'unit',
    path: '/units/unit-123',
    state: { headerTitle: 'Unit 006' },
  },
)

const newTransactionPage = readSource('src/pages/NewTransactionPage.jsx')
assert.ok(
  newTransactionPage.indexOf('if (result?.transactionId)') < newTransactionPage.indexOf('if (result?.unitId)'),
  'NewTransactionPage must prefer transactionId before unitId.',
)

const newTransactionWizard = readSource('src/components/NewTransactionWizard.jsx')
assert.ok(
  newTransactionWizard.indexOf('if (createdTransaction.transactionId)') < newTransactionWizard.indexOf('if (createdTransaction.unitId)'),
  'NewTransactionWizard success action must prefer transactionId before unitId.',
)
assert.match(
  newTransactionWizard,
  /navigate\(`\/transactions\$\{query\}`\)/,
  'Agent fallback search should open the transactions route, not units.',
)

for (const sourcePath of ['src/pages/Units.jsx', 'src/pages/DevelopmentDetail.jsx', 'src/pages/Dashboard.jsx']) {
  assert.match(
    readSource(sourcePath),
    /resolveTransactionWorkspaceRoute/,
    `${sourcePath} must use the shared transaction workspace routing helper.`,
  )
}

console.log('developer transaction routing phase 1 test passed')
