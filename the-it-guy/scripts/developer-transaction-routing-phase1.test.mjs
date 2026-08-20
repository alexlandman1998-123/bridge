import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { resolveTransactionWorkspaceRoute } from '../src/core/transactions/transactionWorkspaceRouting.js'
import { buildDeveloperTransactionRelationshipSummary } from '../src/core/transactions/developerTransactionRelationshipProfile.js'
import { buildDeveloperTransactionOperationsSummary } from '../src/core/transactions/developerTransactionOperationsProfile.js'
import { buildDeveloperTransactionMandateProfile } from '../src/core/transactions/developerTransactionMandateProfile.js'
import { buildDeveloperTransactionReadinessProfile } from '../src/core/transactions/developerTransactionReadinessProfile.js'

const appRoot = resolve(import.meta.dirname, '..')
const readSource = (path) => readFileSync(resolve(appRoot, path), 'utf8')

const nullTransactionRelationshipSummary = buildDeveloperTransactionRelationshipSummary({
  transaction: null,
  unit: { development: { name: 'Example Development' } },
  buyer: null,
})
assert.equal(
  nullTransactionRelationshipSummary.rows.find((row) => row.id === 'developer_contact')?.name,
  'Example Development',
  'Developer unit workspaces must tolerate available units without transaction rows.',
)
const nullTransactionOperationsSummary = buildDeveloperTransactionOperationsSummary({ transaction: null })
const nullTransactionMandateProfile = buildDeveloperTransactionMandateProfile({
  transaction: null,
  relationshipSummary: nullTransactionRelationshipSummary,
})
assert.equal(nullTransactionOperationsSummary?.isDeveloperSale, true)
assert.equal(nullTransactionMandateProfile.privateSellerMandateRequired, false)
assert.ok(
  buildDeveloperTransactionReadinessProfile({
    transaction: null,
    relationshipSummary: nullTransactionRelationshipSummary,
    operationsSummary: nullTransactionOperationsSummary,
    mandateProfile: nullTransactionMandateProfile,
  })?.isDeveloperSale,
  'Developer readiness profile should tolerate a null transaction while unit workspace is being created.',
)

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

const developmentDetailSource = readSource('src/pages/DevelopmentDetail.jsx')
assert.ok(
  developmentDetailSource.includes("const DEVELOPMENT_PRIMARY_TABS = DEVELOPMENT_TABS.filter((tab) => tab.id !== 'transactions')") &&
    developmentDetailSource.includes('DEVELOPMENT_PRIMARY_TABS.map'),
  'Development page should remove Transactions from the top tab strip without removing the underlying workspace section.',
)

const apiSource = readSource('src/lib/api.js')
assert.ok(
  apiSource.includes('function resolveDevelopmentSettingsAssignedAgent(settings = {})') &&
    apiSource.includes('const developmentAssignedAgent =') &&
    apiSource.includes('assigned_agent: resolvedAssignedAgent || null') &&
    apiSource.includes('assigned_agent_email: resolvedAssignedAgentEmail || null'),
  'Developer-sale transaction creation should default assigned_agent from development settings or the active setup user.',
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
