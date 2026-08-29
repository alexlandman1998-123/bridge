import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTransactionJourneySnapshot } from '../services/transactionJourneySnapshot.js'

const AUDIENCES = [
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
const EXTERNAL_AUDIENCES = new Set(['buyer', 'seller', 'external_share'])
const DERIVED_AT = '2026-08-28T20:00:00.000Z'

function step(key, ownerRole, status = 'pending') {
  return { key, label: key.replace(/_/g, ' '), ownerRole, status, required: true }
}

function scenario({ key, milestone, workflowItem, ownerRole, externalSummary, parentStage, financeType = 'bond', blocked = false, completedSteps = [] }) {
  const currentStep = step(workflowItem, ownerRole, blocked ? 'blocked' : 'pending')
  const requiredSteps = [...completedSteps.map((item) => step(item, 'attorney', 'complete')), currentStep]
  const workflow = { workflowKey: milestone === 'finance' ? 'finance_bond' : 'attorney_transfer', required: true, requiredSteps }
  return { key, milestone, workflowItem, ownerRole, externalSummary, parentStage, financeType, blocked, currentStep, workflow }
}

const SCENARIOS = [
  scenario({ key: 'bond_waiting_for_quotes', milestone: 'finance', workflowItem: 'waiting_for_bank_quotes', ownerRole: 'bond_originator', externalSummary: 'The bond application is with the banks and the finance team is waiting for feedback and quotes.', parentStage: 'FINANCE' }),
  scenario({ key: 'guarantees_being_issued', milestone: 'guarantees', workflowItem: 'guarantees_issued', ownerRole: 'bond_attorney', externalSummary: 'The appointed attorneys are preparing the required guarantees.', parentStage: 'TRANSFER' }),
  scenario({ key: 'rates_clearance_requested', milestone: 'transfer', workflowItem: 'rates_clearance_requested', ownerRole: 'transfer_attorney', externalSummary: 'Municipal clearance figures have been requested and the transfer team is waiting for the municipality.', parentStage: 'TRANSFER', completedSteps: ['guarantees_confirmed'] }),
  scenario({ key: 'simultaneous_lodgement_preparation', milestone: 'lodgement', workflowItem: 'ready_for_lodgement', ownerRole: 'transfer_attorney', externalSummary: 'The legal teams are coordinating readiness for lodgement.', parentStage: 'TRANSFER', completedSteps: ['guarantees_confirmed'] }),
  scenario({ key: 'lodged_at_deeds_office', milestone: 'lodgement', workflowItem: 'all_required_matters_lodged', ownerRole: 'transfer_attorney', externalSummary: 'The matter has been lodged and is progressing through the Deeds Office.', parentStage: 'REGISTRATION', completedSteps: ['guarantees_confirmed'] }),
  scenario({ key: 'registration_confirmed', milestone: 'registration', workflowItem: 'registration_confirmed', ownerRole: 'transfer_attorney', externalSummary: 'Registration has been confirmed.', parentStage: 'REGISTRATION', completedSteps: ['guarantees_confirmed'] }),
  scenario({ key: 'cash_purchase_funds_verification', milestone: 'finance', workflowItem: 'proof_of_funds', ownerRole: 'agent', externalSummary: 'Proof of funds is being verified before transfer continues.', parentStage: 'FINANCE', financeType: 'cash' }),
  scenario({ key: 'blocked_otp_signature', milestone: 'otp_signed', workflowItem: 'sign_otp', ownerRole: 'agent', externalSummary: 'The signed Offer to Purchase is still required before the transaction can progress.', parentStage: 'SALES_OTP', blocked: true }),
]

function snapshotFor(item, actorRole) {
  return buildTransactionJourneySnapshot({
    transactionId: `tx-${item.key}`,
    transaction: { id: `tx-${item.key}`, finance_type: item.financeType, updated_at: DERIVED_AT },
    parentStage: item.parentStage,
    parentStatus: item.blocked ? 'blocked' : 'active',
    progressPercent: 42,
    activeWorkflow: item.workflow,
    activeStep: item.currentStep,
    workflows: { [item.workflow.workflowKey]: item.workflow },
    blockers: item.blocked ? [{ message: 'Private internal blocker detail' }] : [],
    derivedAt: DERIVED_AT,
    actorRole,
  })
}

for (const item of SCENARIOS) {
  test(`${item.key} remains semantically aligned for every audience`, () => {
    const snapshots = AUDIENCES.map((audience) => snapshotFor(item, audience))
    const semanticState = (snapshot) => ({
      version: snapshot.version,
      milestone: snapshot.currentMilestoneKey,
      workflowItem: snapshot.currentWorkflowItem?.key,
      ownerRole: snapshot.currentWorkflowItem?.ownerRole,
      progressPercent: snapshot.progressPercent,
      derivedAt: snapshot.derivedAt,
    })

    for (const snapshot of snapshots) {
      assert.deepEqual(semanticState(snapshot), semanticState(snapshots[0]))
      assert.equal(snapshot.currentMilestoneKey, item.milestone)
      assert.equal(snapshot.currentWorkflowItem?.key, item.workflowItem)
      assert.equal(JSON.stringify(snapshot).includes('Private internal blocker detail'), false)
      if (EXTERNAL_AUDIENCES.has(snapshot.audience.role)) {
        assert.equal(snapshot.currentWorkflowItem?.summary, item.externalSummary)
        assert.equal(snapshot.audience.visibility, 'external')
      }
    }
  })
}
