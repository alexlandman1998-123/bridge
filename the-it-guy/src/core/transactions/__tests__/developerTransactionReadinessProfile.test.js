import assert from 'node:assert/strict'
import { buildDeveloperTransactionMandateProfile } from '../developerTransactionMandateProfile.js'
import { buildDeveloperTransactionOperationsSummary } from '../developerTransactionOperationsProfile.js'
import {
  buildDeveloperTransactionReadinessProfile,
  buildDeveloperTransactionReadinessProfileFromRow,
} from '../developerTransactionReadinessProfile.js'
import { buildDeveloperTransactionRelationshipSummary } from '../developerTransactionRelationshipProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function buildProfile({
  transaction = {},
  unit = { development: { name: 'Junoah Estate' } },
  buyer = { name: 'Client Buyer' },
  rolePlayers = [],
  operations = {},
  onboardingStatus = 'Complete',
} = {}) {
  const resolvedTransaction = { transaction_type: 'developer_sale', ...transaction }
  const relationshipSummary = buildDeveloperTransactionRelationshipSummary({
    transaction: resolvedTransaction,
    unit,
    buyer,
    rolePlayers,
  })
  const operationsSummary = buildDeveloperTransactionOperationsSummary({
    transaction: resolvedTransaction,
    handover: operations.handover || {},
    documents: operations.documents || [],
    clientIssues: operations.clientIssues || [],
    developmentSettings: operations.developmentSettings || {},
    onboardingStatus,
  })
  const mandateProfile = buildDeveloperTransactionMandateProfile({
    transaction: resolvedTransaction,
    unit,
    buyer,
    relationshipSummary,
  })

  return buildDeveloperTransactionReadinessProfile({
    transaction: resolvedTransaction,
    relationshipSummary,
    operationsSummary,
    mandateProfile,
    onboardingStatus,
  })
}

test('returns null for non-developer transactions', () => {
  assert.equal(buildDeveloperTransactionReadinessProfile({ transaction: { transaction_type: 'private_property' } }), null)
})

test('prioritises missing developer or buyer relationship setup', () => {
  const profile = buildProfile({
    unit: {},
    buyer: {},
    onboardingStatus: 'Not Started',
  })

  assert.equal(profile.healthLabel, 'Attention')
  assert.equal(profile.healthTone, 'danger')
  assert.equal(profile.nextAction.id, 'developer_relationship_setup')
  assert.equal(profile.nextAction.targetMenu, 'onboarding')
  assert.match(profile.nextAction.description, /Developer/)
  assert.match(profile.nextAction.description, /Buyer/)
})

test('surfaces developer-agent mandate preparation when signer ready', () => {
  const profile = buildProfile({
    transaction: {
      assigned_agent: 'Maya Agent',
      assigned_agent_email: 'maya@example.test',
    },
  })

  assert.equal(profile.nextAction.id, 'developer_agent_mandate_prepare')
  assert.equal(profile.nextAction.targetMenu, 'documents')
  assert.equal(profile.healthLabel, 'Waiting')
  assert.equal(profile.warnings.length, 1)
})

test('surfaces reservation proof review ahead of normal buyer workflow', () => {
  const profile = buildProfile({
    transaction: {
      reservation_required: true,
      reservation_status: 'paid',
    },
  })

  assert.equal(profile.nextAction.id, 'reservation_proof_review')
  assert.equal(profile.nextAction.targetMenu, 'financials')
  assert.equal(profile.nextAction.priority, 'High')
})

test('surfaces registered handover blockers after registration', () => {
  const profile = buildProfile({
    transaction: {
      current_main_stage: 'REG',
      reservation_required: true,
      reservation_status: 'verified',
    },
    operations: {
      handover: {
        status: 'in_progress',
        inspectionCompleted: true,
        keysHandedOver: false,
        manualsHandedOver: false,
      },
      clientIssues: [{ status: 'open' }],
      developmentSettings: {
        handover_enabled: true,
        snag_reporting_enabled: true,
      },
    },
  })

  assert.equal(profile.nextAction.id, 'handover_blockers')
  assert.equal(profile.nextAction.targetMenu, 'handover')
  assert.equal(profile.healthTone, 'danger')
})

test('builds developer readiness from transaction list rows', () => {
  const profile = buildDeveloperTransactionReadinessProfileFromRow({
    development: { id: 'dev-1', name: 'Junoah Estate' },
    unit: { id: 'unit-1', unit_number: '006', development_id: 'dev-1' },
    buyer: { name: 'Client Buyer' },
    transaction: {
      id: 'tx-1',
      transaction_type: 'developer_sale',
      reservation_required: true,
      reservation_status: 'paid',
      assigned_agent: 'Maya Agent',
      assigned_agent_email: 'maya@example.test',
      onboarding_status: 'Complete',
    },
  })

  assert.equal(profile.isDeveloperSale, true)
  assert.equal(profile.nextAction.id, 'developer_agent_mandate_prepare')
  assert.equal(profile.actionQueue.some((item) => item.id === 'reservation_proof_review'), true)
})

test('row readiness ignores private property rows', () => {
  assert.equal(
    buildDeveloperTransactionReadinessProfileFromRow({
      transaction: {
        transaction_type: 'private_property',
        reservation_required: true,
        reservation_status: 'paid',
      },
    }),
    null,
  )
})

test('row readiness surfaces handover blockers for registered development rows', () => {
  const profile = buildDeveloperTransactionReadinessProfileFromRow({
    development: { id: 'dev-1', name: 'Junoah Estate' },
    unit: { id: 'unit-1', development_id: 'dev-1' },
    buyer: { name: 'Client Buyer' },
    handover: {
      status: 'in_progress',
      inspectionCompleted: true,
    },
    snagSummary: {
      openCount: 2,
    },
    transaction: {
      id: 'tx-1',
      transaction_type: 'developer_sale',
      current_main_stage: 'REG',
      reservation_required: true,
      reservation_status: 'verified',
      onboarding_status: 'Complete',
    },
  })

  assert.equal(profile.nextAction.id, 'handover_blockers')
  assert.equal(profile.nextAction.targetMenu, 'handover')
  assert.equal(profile.healthTone, 'danger')
})
