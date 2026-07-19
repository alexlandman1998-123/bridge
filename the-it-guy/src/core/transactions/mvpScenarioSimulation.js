import { resolveTransactionRoutingProfile } from '../../services/transactionRoutingProfileService.js'
import { prepareMvpTransactionCreationCommand } from './mvpTransactionCreationCommand.js'
import { buildMvpTransactionParticipantBootstrap } from './mvpTransactionParticipantBootstrap.js'
import { buildMvpTransactionDocumentBootstrap } from './mvpTransactionDocumentBootstrap.js'
import { buildMvpTransactionWorkflowBootstrap } from './mvpTransactionWorkflowBootstrap.js'
import { buildMvpTransactionTruth } from './mvpTransactionTruth.js'

export const MVP_SCENARIO_SIMULATION_VERSION = 'arch9_mvp_scenario_simulation_v1'

export function runMvpTransactionScenario(scenario = {}) {
  const routingProfile = resolveTransactionRoutingProfile({
    transaction: scenario,
    listing: scenario.listing || {},
    financeType: scenario.financeType,
    transactionType: scenario.transactionType,
    propertyTenure: scenario.propertyTenure,
    buyerEntityType: scenario.buyerEntityType,
    sellerEntityType: scenario.sellerEntityType,
    sellerHasExistingBond: scenario.sellerHasExistingBond,
  })
  const command = prepareMvpTransactionCreationCommand({
    routingProfile,
    organisationId: scenario.organisationId || 'simulation-org',
    listingId: scenario.listingId || 'simulation-listing',
    leadId: scenario.leadId || 'simulation-lead',
    acceptedOfferId: scenario.acceptedOfferId || `offer-${scenario.id || 'simulation'}`,
    assignedAgentEmail: scenario.assignedAgentEmail || 'agent@arch9.test',
  })
  const participants = buildMvpTransactionParticipantBootstrap({
    routingProfile,
    buyer: { name: 'Buyer', email: 'buyer@arch9.test' },
    seller: { name: 'Seller', email: 'seller@arch9.test' },
    agent: { email: command.acceptedOfferId ? 'agent@arch9.test' : '' },
  })
  const documents = buildMvpTransactionDocumentBootstrap(routingProfile)
  const workflow = buildMvpTransactionWorkflowBootstrap(routingProfile)
  const truth = buildMvpTransactionTruth({
    transaction: { id: `tx-${scenario.id || 'simulation'}`, current_main_stage: 'DEP' },
    routingProfile,
    participants: participants.participants.map((item) => ({ role_type: item.roleType, transaction_role: item.transactionRole, status: 'active' })),
    documentRequirements: documents.requirements.map((item) => ({ ...item, status: 'pending', required_from_role: item.requiredFromRole })),
    workflowLanes: workflow.lanes,
  })
  return { version: MVP_SCENARIO_SIMULATION_VERSION, scenario, routingProfile, command, participants, documents, workflow, truth }
}
