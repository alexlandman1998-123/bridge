import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_MATTER_TEAM_OWNERSHIP_VERSION,
  MATTER_TEAM_CAPACITY_STATUSES,
  assignConveyancerMatterActionOwnership,
  buildConveyancerMatterTeamOwnership,
} from '../conveyancerMatterTeamOwnership.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const occurredAt = '2026-07-15T11:00:00.000Z'
const actor = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }

function activePlan() {
  const generated = generateConveyancerMatterPlan({
    transaction: {
      id: 'tx-a6-1',
      organisation_id: 'org-a6-1',
      finance_type: 'cash',
      transaction_type: 'private_sale',
      buyer_entity_type: 'individual',
      seller_entity_type: 'individual',
      seller_has_existing_bond: false,
      property_tenure: 'freehold',
    },
    generatedAt: '2026-07-15T08:00:00.000Z',
  })
  assert.equal(generated.valid, true)
  return {
    ...structuredClone(generated.plan),
    status: MATTER_PLAN_STATUSES.active,
    activatedAt: '2026-07-15T08:05:00.000Z',
  }
}

function teams() {
  return [
    { id: 'team-transfer', name: 'Transfers', maxWorkload: 30, status: 'active' },
    { id: 'team-admin', name: 'Conveyancing Admin', maxWorkload: 15, status: 'active' },
    { id: 'team-accounts', name: 'Accounts', maxWorkload: 10, status: 'active' },
  ]
}

function members() {
  return [
    { userId: 'transfer-1', fullName: 'Transfer One', teamId: 'team-transfer', role: 'transfer_attorney', status: 'active', maxWorkload: 10 },
    { userId: 'transfer-2', fullName: 'Transfer Two', teamId: 'team-transfer', role: 'transfer_attorney', status: 'active', maxWorkload: 10 },
    { userId: 'secretary-1', fullName: 'Secretary One', teamId: 'team-admin', role: 'conveyancing_secretary', status: 'active', maxWorkload: 8 },
    { userId: 'accounts-1', fullName: 'Accounts One', teamId: 'team-accounts', planRole: 'accounts', role: 'admin_staff', status: 'active', maxWorkload: 8 },
  ]
}

function report(plan = activePlan(), overrides = {}) {
  return buildConveyancerMatterTeamOwnership({
    plan,
    members: members(),
    teams: teams(),
    actor,
    asOf: occurredAt,
    ...overrides,
  })
}

test('builds team ownership coverage across legal, admin and accounts work', () => {
  const result = report()
  assert.equal(result.version, CONVEYANCER_MATTER_TEAM_OWNERSHIP_VERSION)
  assert.equal(result.valid, true)
  assert.equal(result.metrics.unassigned, result.metrics.activeActions)
  assert.ok(result.actions.find((item) => item.actionKey === 'open_matter').candidateUserIds.includes('secretary-1'))
  assert.ok(result.actions.find((item) => item.actionKey === 'verify_parties').candidateUserIds.includes('transfer-1'))
  assert.deepEqual(result.actions.find((item) => item.actionKey === 'confirm_tax_position').candidateUserIds, ['accounts-1'])
  assert.equal(result.recommendations.length, result.metrics.activeActions)
})

test('recommends the lowest-load capable member deterministically', () => {
  const result = report(activePlan(), {
    existingWorkloadByUser: { 'transfer-1': 9, 'transfer-2': 1 },
  })
  const recommendation = result.actions.find((item) => item.actionKey === 'verify_parties').recommendation
  assert.equal(recommendation.targetUserId, 'transfer-2')
  assert.equal(recommendation.targetTeamId, 'team-transfer')
})

test('detects stale assignments and recommends a handover', () => {
  const plan = activePlan()
  const action = plan.actions.find((item) => item.key === 'verify_parties')
  action.owner.userId = 'former-user'
  action.owner.teamId = 'team-transfer'
  const result = report(plan)
  const ownership = result.actions.find((item) => item.actionKey === action.key)
  assert.equal(ownership.ownershipStatus, 'stale_user_assignment')
  assert.equal(ownership.handoverRequired, true)
  assert.equal(ownership.recommendation.type, 'handover')
})

test('detects overloaded owners and recommends another capable member', () => {
  const plan = activePlan()
  const action = plan.actions.find((item) => item.key === 'verify_parties')
  action.owner.userId = 'transfer-1'
  action.owner.teamId = 'team-transfer'
  const result = report(plan, { existingWorkloadByUser: { 'transfer-1': 20, 'transfer-2': 2 } })
  const owner = result.members.find((item) => item.userId === 'transfer-1')
  const ownership = result.actions.find((item) => item.actionKey === action.key)
  assert.equal(owner.capacityStatus, MATTER_TEAM_CAPACITY_STATUSES.overloaded)
  assert.equal(ownership.ownershipStatus, 'overloaded_owner')
  assert.equal(ownership.recommendation.targetUserId, 'transfer-2')
})

test('requests capacity intervention instead of recommending an overloaded target', () => {
  const result = report(activePlan(), {
    existingWorkloadByUser: { 'transfer-1': 20, 'transfer-2': 20 },
  })
  const recommendation = result.actions.find((item) => item.actionKey === 'verify_parties').recommendation
  assert.equal(recommendation.type, 'capacity_required')
  assert.equal(recommendation.targetUserId, null)
})

test('flags critical work with insufficient capable-member coverage', () => {
  const result = buildConveyancerMatterTeamOwnership({
    plan: activePlan(),
    members: members().filter((item) => item.userId !== 'transfer-2'),
    teams: teams(),
    actor,
    asOf: occurredAt,
  })
  assert.ok(result.coverageRisks.some((item) => item.type === 'single_point_of_failure'))
  assert.equal(result.metrics.coverageRisks > 0, true)
})

test('does not recommend members from an incompatible role', () => {
  const result = report()
  const legal = result.actions.find((item) => item.actionKey === 'verify_parties')
  assert.equal(legal.candidateUserIds.includes('secretary-1'), false)
  assert.equal(legal.candidateUserIds.includes('accounts-1'), false)
})

test('applies an authorised assignment through the A5 command service', () => {
  const plan = activePlan()
  const before = structuredClone(plan)
  const result = assignConveyancerMatterActionOwnership({
    plan,
    actionKey: 'verify_parties',
    targetUserId: 'transfer-2',
    targetTeamId: 'team-transfer',
    members: members(),
    teams: teams(),
    actor,
    reason: 'Allocate new matter to the available transfer team member',
    commandId: 'ownership-assign-1',
    occurredAt,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(plan, before)
  const assigned = result.plan.actions.find((item) => item.key === 'verify_parties')
  assert.equal(assigned.owner.role, MATTER_PLAN_OWNER_ROLES.transferAttorney)
  assert.equal(assigned.owner.userId, 'transfer-2')
  assert.equal(result.ownership.type, 'assignment')
})

test('supports assignment to a covered team pool without selecting a person', () => {
  const result = assignConveyancerMatterActionOwnership({
    plan: activePlan(),
    actionKey: 'verify_parties',
    targetTeamId: 'team-transfer',
    members: members(),
    teams: teams(),
    actor,
    reason: 'Route to the transfer team pool for daily allocation',
    commandId: 'ownership-pool-1',
    occurredAt,
  })
  assert.equal(result.ok, true)
  const assigned = result.plan.actions.find((item) => item.key === 'verify_parties')
  assert.equal(assigned.owner.userId, null)
  assert.equal(assigned.owner.teamId, 'team-transfer')
  assert.equal(result.ownership.type, 'team_pool_assignment')
})

test('rejects inactive, incompatible and over-capacity targets', () => {
  const inactiveMembers = members().map((item) => item.userId === 'transfer-1' ? { ...item, status: 'suspended' } : item)
  const inactive = assignConveyancerMatterActionOwnership({
    plan: activePlan(), actionKey: 'verify_parties', targetUserId: 'transfer-1', targetTeamId: 'team-transfer',
    members: inactiveMembers, teams: teams(), actor, reason: 'Test inactive', commandId: 'inactive-1', occurredAt,
  })
  assert.equal(inactive.code, 'target_member_not_eligible')

  const incompatible = assignConveyancerMatterActionOwnership({
    plan: activePlan(), actionKey: 'verify_parties', targetUserId: 'secretary-1', targetTeamId: 'team-admin',
    members: members(), teams: teams(), actor, reason: 'Test role', commandId: 'role-1', occurredAt,
  })
  assert.equal(incompatible.code, 'target_member_not_eligible')

  const overloaded = assignConveyancerMatterActionOwnership({
    plan: activePlan(), actionKey: 'verify_parties', targetUserId: 'transfer-1', targetTeamId: 'team-transfer',
    members: members(), teams: teams(), actor, reason: 'Test capacity', commandId: 'capacity-1', occurredAt,
    existingWorkloadByUser: { 'transfer-1': 20 },
  })
  assert.equal(overloaded.code, 'target_member_over_capacity')
})

test('preserves action-owner boundaries when a non-manager assigns another function', () => {
  const result = assignConveyancerMatterActionOwnership({
    plan: activePlan(),
    actionKey: 'confirm_tax_position',
    targetUserId: 'accounts-1',
    targetTeamId: 'team-accounts',
    members: members(),
    teams: teams(),
    actor: { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'transfer-1', teamIds: ['team-transfer'] },
    reason: 'Attempted cross-function allocation',
    commandId: 'ownership-cross-function-1',
    occurredAt,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'action_owned_by_another_role')
})

test('does not expose ownership data to an actor without plan visibility', () => {
  const result = report(activePlan(), { actor: { role: 'unknown_role' } })
  assert.equal(result.valid, false)
  assert.deepEqual(result.actions, [])
  assert.deepEqual(result.members, [])
})

console.log('conveyancer matter-plan A6 team ownership tests passed')
