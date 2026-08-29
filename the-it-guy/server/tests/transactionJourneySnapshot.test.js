import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRANSACTION_JOURNEY_MILESTONES,
  buildTransactionJourneySnapshot,
} from '../services/transactionJourneySnapshot.js'

const derivedAt = '2026-08-28T18:00:00.000Z'

function createStep(key, overrides = {}) {
  return {
    key,
    label: key.replace(/_/g, ' '),
    status: 'pending',
    ownerRole: 'attorney',
    required: true,
    ...overrides,
  }
}

function buildSnapshot(overrides = {}) {
  const activeStep = overrides.activeStep || createStep('feedback_received', { ownerRole: 'bond_originator' })
  const activeWorkflow = overrides.activeWorkflow || {
    workflowKey: 'finance_bond',
    required: true,
    requiredSteps: [activeStep],
  }
  return buildTransactionJourneySnapshot({
    transactionId: 'tx-phase-2',
    transaction: { id: 'tx-phase-2', finance_type: 'bond', updated_at: derivedAt },
    parentStage: 'FINANCE',
    parentStatus: 'active',
    progressPercent: 33,
    activeWorkflow,
    activeStep,
    workflows: { finance_bond: activeWorkflow },
    blockers: [],
    derivedAt,
    actorRole: 'agent',
    ...overrides,
  })
}

test('builds the frozen six-stage versioned contract', () => {
  const snapshot = buildSnapshot()

  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.version, `transaction-journey-v1:${derivedAt}`)
  assert.equal(snapshot.currentMilestoneKey, 'finance')
  assert.equal(snapshot.progressPercent, 33)
  assert.deepEqual(snapshot.milestones.map((milestone) => milestone.key), TRANSACTION_JOURNEY_MILESTONES.map((milestone) => milestone.key))
  assert.equal(snapshot.milestones.filter((milestone) => milestone.isCurrent).length, 1)
  assert.equal(snapshot.currentWorkflowItem.key, 'feedback_received')
  assert.equal(snapshot.currentWorkflowItem.ownerRole, 'bond_originator')
})

test('projects audience-safe copy without changing semantic state', () => {
  const audiences = [
    'agent',
    'buyer',
    'seller',
    'transfer_attorney',
    'bond_originator',
    'bond_attorney',
    'cancellation_attorney',
    'developer',
    'external_share',
  ]
  const snapshots = audiences.map((actorRole) => buildSnapshot({ actorRole }))
  const agent = snapshots[0]
  const buyer = snapshots[1]
  const seller = snapshots[2]
  const semanticFields = (snapshot) => ({
    version: snapshot.version,
    currentMilestoneKey: snapshot.currentMilestoneKey,
    progressPercent: snapshot.progressPercent,
    workflowItemKey: snapshot.currentWorkflowItem.key,
    workflowKey: snapshot.currentWorkflowItem.workflowKey,
    ownerRole: snapshot.currentWorkflowItem.ownerRole,
    derivedAt: snapshot.derivedAt,
  })

  for (const snapshot of snapshots.slice(1)) {
    assert.deepEqual(semanticFields(agent), semanticFields(snapshot))
  }
  assert.equal(agent.audience.visibility, 'internal')
  assert.equal(buyer.audience.visibility, 'external')
  assert.equal(seller.audience.visibility, 'external')
  assert.equal(snapshots.at(-1).audience.visibility, 'external')
  assert.match(agent.currentWorkflowItem.summary, /bond originator/i)
  assert.doesNotMatch(buyer.currentWorkflowItem.summary, /originator/i)
  assert.match(buyer.currentWorkflowItem.summary, /banks/i)
})

test('keeps guarantees ahead of transfer while required guarantee work is outstanding', () => {
  const activeStep = createStep('transfer_documents_prepared')
  const transferWorkflow = {
    workflowKey: 'attorney_transfer',
    required: true,
    requiredSteps: [
      activeStep,
      createStep('guarantees_confirmed'),
      createStep('ready_for_lodgement'),
    ],
  }
  const snapshot = buildSnapshot({
    parentStage: 'TRANSFER',
    activeStep,
    activeWorkflow: transferWorkflow,
    workflows: { attorney_transfer: transferWorkflow },
  })

  assert.equal(snapshot.currentMilestoneKey, 'guarantees')
  assert.equal(snapshot.currentWorkflowItem.key, 'transfer_documents_prepared')
})

test('advances to transfer and lodgement only after guarantee dependencies complete', () => {
  const guarantee = createStep('guarantees_confirmed', { status: 'complete' })
  const transferStep = createStep('clearance_figures_requested')
  const transferWorkflow = {
    workflowKey: 'attorney_transfer',
    required: true,
    requiredSteps: [transferStep, guarantee, createStep('ready_for_lodgement')],
  }
  const transferSnapshot = buildSnapshot({
    parentStage: 'TRANSFER',
    activeStep: transferStep,
    activeWorkflow: transferWorkflow,
    workflows: { attorney_transfer: transferWorkflow },
  })
  const lodgementStep = createStep('ready_for_lodgement')
  const lodgementSnapshot = buildSnapshot({
    parentStage: 'TRANSFER',
    activeStep: lodgementStep,
    activeWorkflow: { ...transferWorkflow, requiredSteps: [guarantee, lodgementStep] },
    workflows: { attorney_transfer: { ...transferWorkflow, requiredSteps: [guarantee, lodgementStep] } },
  })

  assert.equal(transferSnapshot.currentMilestoneKey, 'transfer')
  assert.equal(transferSnapshot.currentWorkflowItem.summary, 'Clearance figures have been requested and are awaiting the municipality.')
  assert.equal(lodgementSnapshot.currentMilestoneKey, 'lodgement')
})

test('skips the guarantee milestone for a cash transaction without bond or cancellation lanes', () => {
  const transferStep = createStep('transfer_documents_prepared')
  const transferWorkflow = {
    workflowKey: 'attorney_transfer',
    required: true,
    requiredSteps: [transferStep, createStep('guarantees_confirmed')],
  }
  const snapshot = buildSnapshot({
    transaction: { id: 'tx-cash', finance_type: 'cash', updated_at: derivedAt },
    parentStage: 'TRANSFER',
    activeStep: transferStep,
    activeWorkflow: transferWorkflow,
    workflows: { attorney_transfer: transferWorkflow },
  })

  assert.equal(snapshot.currentMilestoneKey, 'transfer')
})

test('uses lodgement during registration handoff and completes every milestone at close-out', () => {
  const lodgedStep = createStep('all_required_matters_lodged')
  const registrationWorkflow = {
    workflowKey: 'registration',
    required: true,
    requiredSteps: [lodgedStep, createStep('registration_confirmed')],
  }
  const lodged = buildSnapshot({
    parentStage: 'REGISTRATION',
    activeStep: lodgedStep,
    activeWorkflow: registrationWorkflow,
    workflows: { registration: registrationWorkflow },
  })
  const complete = buildSnapshot({
    parentStage: 'COMPLETE',
    parentStatus: 'complete',
    progressPercent: 100,
    activeStep: null,
    activeWorkflow: null,
    workflows: {},
  })

  assert.equal(lodged.currentMilestoneKey, 'lodgement')
  assert.equal(complete.currentMilestoneKey, null)
  assert.equal(complete.currentWorkflowItem, null)
  assert.equal(complete.milestones.every((milestone) => milestone.status === 'complete'), true)
})

test('marks the current milestone and workflow item blocked without exposing blocker text', () => {
  const snapshot = buildSnapshot({
    parentStatus: 'blocked',
    blockers: [{ code: 'PRIVATE_INTERNAL_REASON', message: 'Sensitive internal note' }],
    actorRole: 'buyer',
  })

  assert.equal(snapshot.status, 'blocked')
  assert.equal(snapshot.currentMilestone.status, 'blocked')
  assert.equal(snapshot.currentWorkflowItem.status, 'blocked')
  assert.equal(JSON.stringify(snapshot).includes('Sensitive internal note'), false)
})
