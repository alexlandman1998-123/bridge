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
    developmentId: 'dev-123',
    transactionId: 'tx-123',
    transactionReference: 'TRX-006',
  }),
  {
    kind: 'transaction',
    path: '/developments/dev-123/transactions/tx-123',
    state: { headerTitle: 'TRX-006', developmentId: 'dev-123' },
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
assert.ok(
  newTransactionWizard.includes("function createInitialForm(initialDevelopmentId = '', initialUnitId = '')") &&
    newTransactionWizard.includes('unitId: initialUnitId ||') &&
    newTransactionWizard.includes('const selected = units.find((unit) => unit.id === form.setup.unitId)'),
  'NewTransactionWizard should preserve a preselected development unit, including manual OTP units.',
)
assert.match(
  newTransactionWizard,
  /navigate\(`\/transactions\$\{query\}`\)/,
  'Agent fallback search should open the transactions route, not units.',
)

const appSource = readSource('src/App.jsx')
assert.match(
  appSource,
  /path="\/developments\/:developmentId\/transactions\/:transactionId"/,
  'Development transaction rows should open the transaction workspace inside the development route.',
)
assert.ok(
  appSource.includes('const [wizardInitialUnitId, setWizardInitialUnitId]') &&
    appSource.includes('const requestedUnitId = event?.detail?.initialUnitId') &&
    appSource.includes('const requestedPropertyMode = event?.detail?.initialPropertyMode') &&
    appSource.includes('initialUnitId={wizardInitialUnitId}'),
  'App should pass the initial development unit id into transaction wizards.',
)

const agentNewDealWizard = readSource('src/components/AgentNewDealWizard.jsx')
assert.ok(
  agentNewDealWizard.includes("initialUnitId = ''") &&
    agentNewDealWizard.includes("initialPropertyMode = ''") &&
    agentNewDealWizard.includes('initialPropertyMode === PROPERTY_MODE_DEVELOPMENT || initialUnitId') &&
    agentNewDealWizard.includes('? PROPERTY_MODE_DEVELOPMENT') &&
    agentNewDealWizard.includes('const selected = rows.find((unit) => String(unit?.id) === String(form.unitId))'),
  'AgentNewDealWizard should open in development mode with the preselected unit.',
)

for (const sourcePath of ['src/pages/Units.jsx', 'src/pages/DevelopmentDetail.jsx', 'src/pages/Dashboard.jsx']) {
  assert.match(
    readSource(sourcePath),
    /resolveTransactionWorkspaceRoute/,
    `${sourcePath} must use the shared transaction workspace routing helper.`,
  )
}

console.log('developer transaction routing phase 1 test passed')
