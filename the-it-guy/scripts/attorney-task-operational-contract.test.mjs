import assert from 'node:assert/strict'
import {
  ATTORNEY_WORKFLOW_LANES,
  getAttorneyStageDefinitionsForLane,
  getAttorneyTaskOperationalContract,
} from '../src/constants/attorneyWorkflowStages.js'
import {
  ATTORNEY_TASK_CONTRACT_VERSION,
  assertAttorneyTaskStatusAction,
  buildAttorneyTaskMutationPacket,
  presentAttorneyTaskOperationalContract,
} from '../src/core/transactions/attorneyTaskOperationalContract.js'
import { normalizeAttorneyWorkflowWorkPacket } from '../src/constants/attorneyWorkflowUsability.js'
import { filterClientVisibleActivity } from '../src/services/clientPortalActivityFeedService.js'

let contractCount = 0
for (const laneKey of Object.keys(ATTORNEY_WORKFLOW_LANES)) {
  for (const definition of getAttorneyStageDefinitionsForLane(laneKey)) {
    contractCount += 1
    const contract = definition.operationalContract
    assert.ok(contract, `${laneKey}:${definition.key} requires an operational contract`)
    assert.equal(contract.version, ATTORNEY_TASK_CONTRACT_VERSION)
    assert.equal(contract.laneKey, laneKey)
    assert.equal(contract.taskKey, definition.key)
    assert.ok(contract.taskType)
    assert.ok(contract.primaryAction?.id)
    assert.ok(contract.allowedActions.some((action) => action.status === 'completed'))
    assert.ok(contract.allowedActions.some((action) => action.status === 'blocked'))
    assert.equal(contract.requirements.documents.length, definition.requiredDocuments.length)
    assert.equal(contract.requirements.inputs.length, definition.requiredData.length)
    assert.equal(contract.dependencyPolicy.strategy, 'previous_required_task')
    assert.ok(contract.dueDateRule.businessDays > 0)
    assert.ok(contract.eventPolicy.completed)
  }
}
assert.equal(contractCount, 73)

const buyerFica = getAttorneyTaskOperationalContract('buyer_fica_received', 'transfer')
assert.deepEqual(buyerFica.visibilityPolicy.clientAudience, ['buyer'])
assert.equal(buyerFica.taskType, 'collect_documents')
assert.ok(buyerFica.allowedActions.some((action) => action.id === 'request_document'))
assert.ok(buyerFica.allowedActions.some((action) => action.id === 'upload_document'))
assert.ok(presentAttorneyTaskOperationalContract(buyerFica, { viewerRole: 'buyer' }))
assert.equal(presentAttorneyTaskOperationalContract(buyerFica, { viewerRole: 'seller' }), null)

const sellerFica = getAttorneyTaskOperationalContract('seller_fica_approved', 'transfer')
assert.deepEqual(sellerFica.visibilityPolicy.clientAudience, ['seller'])

const registration = getAttorneyTaskOperationalContract('registered', 'transfer')
assert.deepEqual(registration.visibilityPolicy.clientAudience, ['buyer', 'seller'])

const entityAuthority = getAttorneyTaskOperationalContract('entity_authority_checked', 'transfer')
assert.equal(entityAuthority.visibilityPolicy.clientVisibleAllowed, false)
assert.equal(presentAttorneyTaskOperationalContract(entityAuthority, { viewerRole: 'buyer' }), null)

assert.equal(assertAttorneyTaskStatusAction(buyerFica, 'completed'), 'complete_task')
assert.throws(
  () => assertAttorneyTaskStatusAction(buyerFica, 'cancelled'),
  /not supported/,
)

const mutationPacket = buildAttorneyTaskMutationPacket(buyerFica, { status: 'waiting' })
assert.equal(mutationPacket.contractVersion, ATTORNEY_TASK_CONTRACT_VERSION)
assert.equal(mutationPacket.taskType, 'collect_documents')
assert.equal(mutationPacket.statusAction, 'wait_for_party')
assert.equal(mutationPacket.audience, 'buyer')
assert.deepEqual(mutationPacket.clientAudience, ['buyer'])

const normalizedPacket = normalizeAttorneyWorkflowWorkPacket(mutationPacket)
assert.equal(normalizedPacket.contractVersion, ATTORNEY_TASK_CONTRACT_VERSION)
assert.equal(normalizedPacket.statusAction, 'wait_for_party')
assert.deepEqual(normalizedPacket.clientAudience, ['buyer'])

const buyerEvent = {
  id: 'buyer-fica-event',
  event_type: 'AttorneyWorkflowStepWaiting',
  visibility_scope: 'client_visible',
  event_data: {
    title: 'Buyer compliance update',
    description: 'The buyer compliance review is in progress.',
    workPacket: normalizedPacket,
  },
  created_at: '2026-09-01T08:00:00.000Z',
}
assert.equal(filterClientVisibleActivity([buyerEvent], 'buyer').length, 1)
assert.equal(filterClientVisibleActivity([buyerEvent], 'seller').length, 0)

console.log(`Attorney task operational contract passed for ${contractCount} legal workflow tasks.`)
