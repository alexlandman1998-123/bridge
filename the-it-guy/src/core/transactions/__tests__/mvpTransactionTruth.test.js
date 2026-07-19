import assert from 'node:assert/strict'

import { buildMvpTransactionTruth, MVP_TRANSACTION_TRUTH_VERSION } from '../mvpTransactionTruth.js'
import { evaluateMvpLaunchScope } from '../mvpLaunchScope.js'
import { resolveMvpLaunchRolePlan } from '../mvpLaunchRoles.js'

const profile = {
  transactionType: 'private_sale',
  financeType: 'cash',
  propertyTenure: 'freehold',
  buyerEntityType: 'individual',
  sellerEntityType: 'individual',
  requiresCancellationAttorney: false,
}

{
  const truth = buildMvpTransactionTruth({
    transaction: { id: 'tx-cash', current_main_stage: 'OTP' },
    routingProfile: {
      ...profile,
      launchScope: evaluateMvpLaunchScope(profile),
      launchRolePlan: resolveMvpLaunchRolePlan(profile),
    },
    participants: [
      { transaction_role: 'buyer', status: 'active' },
      { transaction_role: 'seller', status: 'active' },
      { transaction_role: 'agent', status: 'active' },
    ],
    documentRequirements: [
      { id: 'buyer-id', label: 'Buyer ID', requirement_level: 'blocker', requested_from: 'buyer', status: 'pending' },
    ],
    events: [{ event_type: 'transaction_created', created_at: '2026-07-18T09:00:00.000Z' }],
  })

  assert.equal(truth.version, MVP_TRANSACTION_TRUTH_VERSION)
  assert.equal(truth.stage.key, 'OTP')
  assert.equal(truth.participants.missing.length, 0)
  assert.equal(truth.blockers[0].type, 'document')
  assert.equal(truth.nextAction.ownerRole, 'buyer')
  assert.equal(truth.readiness.status, 'blocked')
  assert.equal(truth.recentActivity.recorded, true)
  assert.equal(truth.satisfiesMvpTruthContract, true)
}

{
  const bondProfile = {
    transactionType: 'private_sale',
    financeType: 'bond',
    propertyTenure: 'sectional_title',
    buyerEntityType: 'company',
    sellerEntityType: 'trust',
    requiresCancellationAttorney: true,
  }
  const truth = buildMvpTransactionTruth({
    transaction: { id: 'tx-bond', current_main_stage: 'FIN', next_action: 'Collect income documents' },
    routingProfile: {
      ...bondProfile,
      launchScope: evaluateMvpLaunchScope(bondProfile),
      launchRolePlan: resolveMvpLaunchRolePlan(bondProfile),
    },
    participants: [
      { transaction_role: 'buyer', status: 'active' },
      { transaction_role: 'seller', status: 'active' },
      { transaction_role: 'agent', status: 'active' },
      { transaction_role: 'bond_originator', status: 'active' },
      { mvp_launch_role_key: 'buyer_company_signatory', status: 'active' },
      { mvp_launch_role_key: 'seller_trustee', status: 'active' },
    ],
  })

  assert.deepEqual(truth.participants.missing.map((role) => role.key), [])
  assert.equal(truth.nextAction.label, 'Collect income documents')
  assert.equal(truth.readiness.status, 'ready')
}

{
  const truth = buildMvpTransactionTruth({
    transaction: { id: 'tx-unknown' },
    routingProfile: {},
    workflowLanes: [{ lane_key: 'transfer', status: 'blocked', blocked_reason: 'Rates clearance outstanding', owner_role: 'attorney' }],
  })

  assert.equal(truth.readiness.status, 'incomplete')
  assert.equal(truth.answers.stage, false)
  assert.deepEqual(truth.missingAnswers, ['stage'])
  assert.equal(truth.blockers.some((blocker) => blocker.type === 'workflow'), true)
}

console.log('mvp transaction truth tests passed')
