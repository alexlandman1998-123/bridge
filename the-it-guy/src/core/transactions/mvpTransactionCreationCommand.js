import { assertMvpLaunchScope } from './mvpLaunchScope.js'

export const MVP_TRANSACTION_CREATION_COMMAND_VERSION = 'arch9_mvp_transaction_creation_command_v1'

function normalize(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function requireValue(value, message) {
  if (normalize(value)) return normalize(value)
  const error = new Error(message)
  error.code = 'mvp_transaction_creation_incomplete'
  throw error
}

/**
 * Builds the immutable creation identity used by every MVP transaction entry
 * point. It intentionally contains only facts known at creation time; later
 * phases own participant, document and workflow setup.
 */
export function prepareMvpTransactionCreationCommand({
  routingProfile = {},
  organisationId = '',
  listingId = '',
  leadId = '',
  acceptedOfferId = '',
  assignedAgentId = '',
  assignedAgentEmail = '',
  idempotencyKey = '',
  requireAcceptedOffer = true,
} = {}) {
  const launchScope = assertMvpLaunchScope(routingProfile)
  const scopedOrganisationId = requireValue(organisationId, 'Organisation id is required before creating an MVP transaction.')
  const scopedListingId = requireValue(listingId, 'A listing or property context is required before creating an MVP transaction.')
  const scopedLeadId = requireValue(leadId, 'A buyer lead is required before creating an MVP transaction.')
  const scopedOfferId = normalize(acceptedOfferId)

  if (requireAcceptedOffer && !scopedOfferId) {
    const error = new Error('An accepted offer is required before creating an MVP transaction.')
    error.code = 'mvp_accepted_offer_required'
    throw error
  }

  if (routingProfile.transactionType !== 'development_sale' && !normalize(assignedAgentId) && !normalize(assignedAgentEmail)) {
    const error = new Error('Assigned agent details are required before creating an MVP transaction.')
    error.code = 'mvp_assigned_agent_required'
    throw error
  }

  const sourceIdentity = scopedOfferId ? `offer_${scopedOfferId}` : `lead_${scopedLeadId}`
  const stableIdempotencyKey = normalize(idempotencyKey) || `mvp_tx_${normalizeKey(scopedOrganisationId)}_${normalizeKey(sourceIdentity)}`

  return Object.freeze({
    version: MVP_TRANSACTION_CREATION_COMMAND_VERSION,
    organisationId: scopedOrganisationId,
    listingId: scopedListingId,
    leadId: scopedLeadId,
    acceptedOfferId: scopedOfferId || null,
    idempotencyKey: stableIdempotencyKey,
    launchScope,
    routingProfile,
  })
}
