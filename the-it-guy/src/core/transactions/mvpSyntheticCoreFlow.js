import { resolveTransactionRoutingProfile } from '../../services/transactionRoutingProfileService.js'
import { buildMvpTransactionDocumentBootstrap } from './mvpTransactionDocumentBootstrap.js'
import { prepareMvpTransactionCreationCommand } from './mvpTransactionCreationCommand.js'
import { buildMvpTransactionParticipantBootstrap, MVP_CONTROLLED_TEST_ROLE_SET } from './mvpTransactionParticipantBootstrap.js'
import { assessMvpTestDataProtection, assertMvpTestDataProtection, MVP_TEST_DATA_MARKER } from './mvpTestDataProtection.js'
import { buildMvpTransactionTruth } from './mvpTransactionTruth.js'
import { buildMvpTransactionWorkflowBootstrap } from './mvpTransactionWorkflowBootstrap.js'

export const MVP_SYNTHETIC_CORE_FLOW_VERSION = 'arch9_mvp_synthetic_core_flow_v1'

export const MVP_SYNTHETIC_CORE_SCENARIOS = Object.freeze([
  { id: 'cash-individual', transactionType: 'resale', financeType: 'cash', buyerEntityType: 'individual', sellerEntityType: 'individual' },
  { id: 'bond-company', transactionType: 'private_sale', financeType: 'bond', buyerEntityType: 'company', sellerEntityType: 'individual' },
  { id: 'hybrid-trust', transactionType: 'resale', financeType: 'hybrid', buyerEntityType: 'trust', sellerEntityType: 'individual' },
  { id: 'development-company', transactionType: 'development_sale', financeType: 'cash', buyerEntityType: 'company', sellerEntityType: 'developer' },
])

function marker(value = '') {
  return `${MVP_TEST_DATA_MARKER} ${value}`.trim()
}

function asGateParticipants(participants = []) {
  return participants.map((participant) => ({
    ...participant,
    status: 'active',
    transactionRole: participant.transactionRole,
    roleType: participant.roleType,
    legalRole: participant.legalRole,
    mvpLaunchRoleKey: participant.mvpLaunchRoleKey,
  }))
}

function asGateDocuments(requirements = [], status = 'pending') {
  return requirements.map((requirement) => ({
    ...requirement,
    documentKey: requirement.key,
    documentLabel: requirement.label,
    requiredFromRole: requirement.requiredFromRole,
    isRequired: requirement.required !== false,
    status,
  }))
}

/**
 * Deterministic, non-persistent rehearsal of the MVP path. It proves the
 * source links, accepted-offer conversion command, bootstrap records and gates
 * without creating a real lead, listing, offer, or transaction.
 */
export function runMvpSyntheticCoreFlow(scenario = {}) {
  const id = String(scenario.id || 'cash-individual').trim()
  const organisationId = `test-org-${id}`
  const sellerLead = {
    id: `test-seller-lead-${id}`,
    organisationId,
    name: marker(`Seller ${id}`),
    email: `test.seller.${id}@arch9.invalid`,
  }
  const buyerLead = {
    id: `test-buyer-lead-${id}`,
    organisationId,
    name: marker(`Buyer ${id}`),
    email: `test.buyer.${id}@arch9.invalid`,
  }
  const listing = {
    id: `test-listing-${id}`,
    organisationId,
    sellerLeadId: sellerLead.id,
    listingTitle: marker(`Listing ${id}`),
    seller: { name: sellerLead.name, email: sellerLead.email },
    assignedAgentId: `test-agent-${id}`,
    assignedAgentEmail: `test.agent.${id}@arch9.invalid`,
  }
  const acceptedOffer = {
    id: `test-accepted-offer-${id}`,
    organisationId,
    listingId: listing.id,
    buyerLeadId: buyerLead.id,
    status: 'accepted',
    buyer: { fullName: buyerLead.name, email: buyerLead.email },
  }
  const payload = {
    testMode: true,
    controlledTestRoleSet: MVP_CONTROLLED_TEST_ROLE_SET,
    organisationId,
    acceptedOfferId: acceptedOffer.id,
    originatingBuyerLeadId: buyerLead.id,
    originatingSellerLeadId: sellerLead.id,
    listingId: listing.id,
    buyerName: buyerLead.name,
    buyerEmail: buyerLead.email,
    sellerName: sellerLead.name,
    sellerEmail: sellerLead.email,
    assignedAgentId: listing.assignedAgentId,
    assignedAgentEmail: listing.assignedAgentEmail,
    financeType: scenario.financeType,
    transactionType: scenario.transactionType,
    purchaserType: scenario.buyerEntityType,
    sellerType: scenario.sellerEntityType,
    propertyTenure: 'sectional_title',
    propertyAddress: marker(`1 Synthetic Avenue ${id}`),
  }
  const testDataProtection = assessMvpTestDataProtection({ payload, listing, lead: buyerLead })
  assertMvpTestDataProtection(testDataProtection, {
    testMode: true,
    controlledTestRoleSet: MVP_CONTROLLED_TEST_ROLE_SET,
  })

  const routingProfile = resolveTransactionRoutingProfile({
    transaction: payload,
    listing,
    financeType: scenario.financeType,
    transactionType: scenario.transactionType,
    propertyTenure: payload.propertyTenure,
    buyerEntityType: scenario.buyerEntityType,
    sellerEntityType: scenario.sellerEntityType,
  })
  const creationCommand = prepareMvpTransactionCreationCommand({
    routingProfile,
    organisationId,
    listingId: listing.id,
    leadId: buyerLead.id,
    acceptedOfferId: acceptedOffer.id,
    assignedAgentId: listing.assignedAgentId,
    assignedAgentEmail: listing.assignedAgentEmail,
  })
  const participantBootstrap = buildMvpTransactionParticipantBootstrap({
    routingProfile,
    buyer: { name: buyerLead.name, email: buyerLead.email },
    seller: { name: sellerLead.name, email: sellerLead.email },
    agent: { id: listing.assignedAgentId, name: marker(`Agent ${id}`), email: listing.assignedAgentEmail },
    controlledTestRoleSet: MVP_CONTROLLED_TEST_ROLE_SET,
  })
  const documentBootstrap = buildMvpTransactionDocumentBootstrap(routingProfile)
  const workflowBootstrap = buildMvpTransactionWorkflowBootstrap(routingProfile)
  const transaction = {
    id: `test-transaction-${id}`,
    organisationId,
    listingId: listing.id,
    acceptedOfferId: acceptedOffer.id,
    originatingBuyerLeadId: buyerLead.id,
    originatingSellerLeadId: sellerLead.id,
    creationIdempotencyKey: creationCommand.idempotencyKey,
  }
  const participants = asGateParticipants(participantBootstrap.participants)
  const draftDocuments = asGateDocuments(documentBootstrap.requirements, 'pending')
  const verifiedDocuments = asGateDocuments(documentBootstrap.requirements, 'verified')
  const draftTruth = buildMvpTransactionTruth({
    transaction: { ...transaction, currentMainStage: 'DEP' },
    routingProfile,
    participants,
    documentRequirements: draftDocuments,
    workflowLanes: workflowBootstrap.lanes,
  })
  const readyTruth = buildMvpTransactionTruth({
    transaction: { ...transaction, currentMainStage: 'ATTY' },
    routingProfile,
    participants,
    documentRequirements: verifiedDocuments,
    workflowLanes: workflowBootstrap.lanes,
  })

  return {
    version: MVP_SYNTHETIC_CORE_FLOW_VERSION,
    scenario: { ...scenario, id },
    testDataProtection,
    sellerLead,
    buyerLead,
    listing,
    acceptedOffer,
    creationCommand,
    transaction,
    participantBootstrap,
    documentBootstrap,
    workflowBootstrap,
    draftTruth,
    readyTruth,
  }
}
