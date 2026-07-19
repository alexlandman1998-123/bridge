import assert from 'node:assert/strict'
import {
  ATTORNEY_WORKFLOW_LANES,
  getAttorneySharedProgressDefinition,
  getAttorneyStageDefinitionsForLane,
} from '../src/constants/attorneyWorkflowStages.js'
import {
  buildTransactionProgressSnapshot,
  canViewTransactionProgress,
  presentTransactionProgress,
  TRANSACTION_PROGRESS_VISIBILITY,
} from '../src/core/transactions/sharedTransactionProgressContract.js'
import {
  getOperationalSharedProgressDefinition,
  OPERATIONAL_STEP_DEFINITIONS,
} from '../src/core/workflows/operationalStepMapping.js'

let definitionCount = 0
for (const laneKey of Object.keys(ATTORNEY_WORKFLOW_LANES)) {
  const definitions = getAttorneyStageDefinitionsForLane(laneKey)
  definitionCount += definitions.length
  for (const definition of definitions) {
    const progress = definition.sharedProgress
    assert.ok(progress, `${laneKey}:${definition.key} must define shared progress`)
    assert.equal(progress.processKey, laneKey)
    assert.equal(progress.stepKey, definition.key)
    assert.ok(progress.processLabel)
    assert.ok(progress.ownerRole)
    assert.ok(progress.professional.title)
    assert.ok(progress.professional.description)
    if (definition.clientVisibleAllowed) {
      assert.ok(progress.client?.title, `${laneKey}:${definition.key} needs a client-safe title`)
      assert.ok(progress.client?.description, `${laneKey}:${definition.key} needs a client-safe description`)
    } else {
      assert.equal(progress.client, null)
    }
  }
}
assert.equal(definitionCount, 73)

let operationalDefinitionCount = 0
for (const [laneKey, definitions] of Object.entries(OPERATIONAL_STEP_DEFINITIONS)) {
  for (const definition of definitions) {
    operationalDefinitionCount += 1
    const progress = getOperationalSharedProgressDefinition(laneKey, definition.stepKey)
    assert.ok(progress, `${laneKey}:${definition.stepKey} must define shared progress`)
    assert.ok(progress.professional.title)
    assert.ok(progress.professional.description)
    if (definition.clientVisible) {
      assert.ok(progress.client?.title)
      assert.equal(progress.client?.description, definition.clientUpdateText)
    } else {
      assert.equal(progress.client, null)
    }
  }
}

const ratesProgress = getAttorneySharedProgressDefinition('rates_clearance_requested', 'transfer')
assert.equal(ratesProgress.client.title, 'Rates clearance requested')
assert.match(ratesProgress.client.description, /awaiting the municipality/i)
const ratesSnapshot = buildTransactionProgressSnapshot(ratesProgress, {
  transactionId: 'transaction-1',
  status: 'waiting',
  safeExplanation: 'Awaiting the municipality.',
  lastUpdated: '2026-07-19T12:00:00.000Z',
  expectedNextStep: 'Rates clearance received',
})

assert.equal(ratesSnapshot.processKey, 'transfer')
assert.equal(ratesSnapshot.stepKey, 'rates_figures_requested')
assert.equal(ratesSnapshot.responsibleRole, 'transfer_attorney')
assert.equal(ratesSnapshot.visibility, TRANSACTION_PROGRESS_VISIBILITY.client)
assert.equal(ratesSnapshot.safeExplanation, 'Awaiting the municipality.')
assert.equal('privateNote' in ratesSnapshot, false)
assert.equal('documents' in ratesSnapshot, false)
assert.equal('evidenceRequirements' in ratesSnapshot, false)

const agentView = presentTransactionProgress(ratesSnapshot, { viewerRole: 'agent' })
const clientView = presentTransactionProgress(ratesSnapshot, { viewerRole: 'buyer' })
assert.equal(agentView.title, ratesProgress.professional.title)
assert.equal(clientView.title, ratesProgress.client.title)
assert.equal(clientView.safeExplanation, 'Awaiting the municipality.')

const privateProgress = getAttorneySharedProgressDefinition('entity_authority_checked', 'transfer')
const privateSnapshot = buildTransactionProgressSnapshot(privateProgress, { status: 'in_progress' })
assert.equal(canViewTransactionProgress({ viewerRole: 'agent', visibility: privateSnapshot.visibility }), false)
assert.equal(presentTransactionProgress(privateSnapshot, { viewerRole: 'agent' }), null)
assert.ok(presentTransactionProgress(privateSnapshot, { viewerRole: 'attorney', canViewPrivate: true }))

const professionalSnapshot = buildTransactionProgressSnapshot(ratesProgress, {
  status: 'blocked',
  visibility: TRANSACTION_PROGRESS_VISIBILITY.professional,
  safeExplanation: 'Awaiting corrected municipal account information.',
})
assert.ok(presentTransactionProgress(professionalSnapshot, { viewerRole: 'bond_originator' }))
assert.equal(presentTransactionProgress(professionalSnapshot, { viewerRole: 'seller' }), null)

assert.throws(
  () => buildTransactionProgressSnapshot(privateProgress, { visibility: TRANSACTION_PROGRESS_VISIBILITY.client }),
  /cannot be published to clients/,
)

console.log(`Shared transaction progress contract passed for ${definitionCount} attorney and ${operationalDefinitionCount} operational workflow steps.`)
