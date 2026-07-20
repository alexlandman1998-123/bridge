import { resolveMvpLaunchRolePlan } from './mvpLaunchRoles.js'

export const MVP_TRANSACTION_PARTICIPANT_BOOTSTRAP_VERSION = 'arch9_mvp_transaction_participant_bootstrap_v1'
export const MVP_CONTROLLED_TEST_ROLE_SET = 'mvp_pilot_v1'

function normalize(value) {
  return String(value || '').trim()
}

export function buildMvpTransactionParticipantBootstrap({
  routingProfile = {},
  buyer = {},
  seller = {},
  agent = {},
  controlledTestRoleSet = null,
} = {}) {
  const rolePlan = routingProfile.launchRolePlan || resolveMvpLaunchRolePlan(routingProfile)
  const developmentSale = routingProfile.transactionType === 'development_sale'
  const baseParticipants = [
    {
      roleKey: 'buyer', roleType: 'buyer', legalRole: 'none', transactionRole: 'buyer',
      name: normalize(buyer.name) || 'Buyer pending', email: normalize(buyer.email).toLowerCase() || null,
    },
    {
      roleKey: developmentSale ? 'developer_representative' : 'seller',
      roleType: developmentSale ? 'developer' : 'seller', legalRole: 'none',
      transactionRole: developmentSale ? 'developer_contact' : 'seller',
      name: normalize(seller.name) || (developmentSale ? 'Developer representative pending' : 'Seller pending'),
      email: normalize(seller.email).toLowerCase() || null,
    },
  ]

  if (normalize(agent.id) || normalize(agent.email)) {
    baseParticipants.push({
      roleKey: 'agent', roleType: 'agent', legalRole: 'none', transactionRole: 'listing_agent',
      userId: normalize(agent.id) || null, name: normalize(agent.name) || 'Assigned agent',
      email: normalize(agent.email).toLowerCase() || null,
    })
  }

  const testParticipants = controlledTestRoleSet === MVP_CONTROLLED_TEST_ROLE_SET
    ? buildMvpControlledTestRoleSet({ routingProfile, rolePlan })
    : []
  const overrides = new Map(testParticipants.map((participant) => [participant.roleKey, participant]))
  const participants = baseParticipants.map((participant) => {
    const merged = {
      ...participant,
      ...(overrides.get(participant.roleKey) || {}),
    }
    return {
      ...merged,
      // Entity signatories can share a transaction role with the buyer or
      // seller. Preserve the launch role key so OTP and gate checks can
      // distinguish the required authority from the primary client record.
      mvpLaunchRoleKey: merged.roleKey,
    }
  })
  const capturedKeys = new Set(participants.map((participant) => participant.roleKey))
  for (const participant of testParticipants) {
    if (!capturedKeys.has(participant.roleKey)) {
      participants.push({ ...participant, mvpLaunchRoleKey: participant.roleKey })
    }
  }

  return Object.freeze({
    version: MVP_TRANSACTION_PARTICIPANT_BOOTSTRAP_VERSION,
    rolePlan,
    participants,
    controlledTestRoleSet: controlledTestRoleSet === MVP_CONTROLLED_TEST_ROLE_SET ? MVP_CONTROLLED_TEST_ROLE_SET : null,
    requirements: rolePlan.roles
      .filter((role) => role.key !== 'internal_admin')
      .map((role) => ({
        roleKey: role.key, roleType: role.roleType, legalRole: role.legalRole || 'none',
        transactionRole: role.transactionRole, requiredBy: role.requiredBy,
        requiredAtCreation: role.requiredAtCreation, label: role.label, reason: role.reason,
      })),
  })
}

/** Test-only, non-deliverable actors for an end-to-end pilot rehearsal. */
export function buildMvpControlledTestRoleSet({ routingProfile = {}, rolePlan = null } = {}) {
  const plan = rolePlan || routingProfile.launchRolePlan || resolveMvpLaunchRolePlan(routingProfile)
  const roles = (plan.roles || []).filter((role) => role.key !== 'internal_admin')
  const clientRoleCount = roles.filter((role) => role.roleType === 'client' && (role.legalRole || 'none') === 'none').length

  // The current persisted participant identity is (transaction, role type, legal role).
  // Fail before creation rather than silently replacing one entity signatory with another.
  if (clientRoleCount > 1) {
    throw new Error('MVP_CONTROLLED_TEST_ROLE_SET_CLIENT_ROLE_COLLISION: this scenario needs multiple client entity signatories, which the current participant identity cannot represent safely.')
  }

  return roles.map((role) => ({
    roleKey: role.key,
    roleType: role.roleType,
    legalRole: role.legalRole || 'none',
    transactionRole: role.transactionRole,
    userId: null,
    name: `TEST — DO NOT ACTION ${role.label}`,
    email: `test.${role.key.replace(/_/g, '.')}@arch9.invalid`,
  }))
}
