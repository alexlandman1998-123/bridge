import { resolveMvpLaunchRolePlan } from './mvpLaunchRoles.js'

export const MVP_TRANSACTION_PARTICIPANT_BOOTSTRAP_VERSION = 'arch9_mvp_transaction_participant_bootstrap_v1'

function normalize(value) {
  return String(value || '').trim()
}

export function buildMvpTransactionParticipantBootstrap({ routingProfile = {}, buyer = {}, seller = {}, agent = {} } = {}) {
  const rolePlan = routingProfile.launchRolePlan || resolveMvpLaunchRolePlan(routingProfile)
  const developmentSale = routingProfile.transactionType === 'development_sale'
  const participants = [
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
    participants.push({
      roleKey: 'agent', roleType: 'agent', legalRole: 'none', transactionRole: 'listing_agent',
      userId: normalize(agent.id) || null, name: normalize(agent.name) || 'Assigned agent',
      email: normalize(agent.email).toLowerCase() || null,
    })
  }

  return Object.freeze({
    version: MVP_TRANSACTION_PARTICIPANT_BOOTSTRAP_VERSION,
    rolePlan,
    participants,
    requirements: rolePlan.roles
      .filter((role) => role.key !== 'internal_admin')
      .map((role) => ({
        roleKey: role.key, roleType: role.roleType, legalRole: role.legalRole || 'none',
        transactionRole: role.transactionRole, requiredBy: role.requiredBy,
        requiredAtCreation: role.requiredAtCreation, label: role.label, reason: role.reason,
      })),
  })
}
