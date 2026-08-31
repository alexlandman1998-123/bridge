import { normalizeProperty24Text } from './client.js'
import { fetchCanonicalProperty24AgentProfile } from './agentProfileService.js'
import { fetchOrganisationProperty24Connection } from './organisationConnectionService.js'

const ACTIVE_AGENT_STATUSES = new Set(['active', 'accepted', 'approved'])
const CLOSED_PROPERTY24_STATUSES = new Set(['withdrawn', 'removed', 'cancelled', 'cancelledsale', 'expired'])

function reassignmentError(code, message, status = 400, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  Object.assign(error, details)
  return error
}

function normalizeLower(value = '') {
  return normalizeProperty24Text(value).toLowerCase()
}

function positiveIntegerText(value) {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric) : ''
}

function isMissingRelationError(error = {}, relation = '') {
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  const normalizedRelation = normalizeLower(relation)
  return error.code === '42P01' ||
    error.code === 'PGRST205' ||
    Boolean(normalizedRelation && message.includes(normalizedRelation) && (
      message.includes('does not exist') || message.includes('schema cache')
    ))
}

function firstText(...values) {
  return values.map(normalizeProperty24Text).find(Boolean) || ''
}

function isRentalListing(listing = {}) {
  const canonicalFacts = listing.seller_canonical_facts_json && typeof listing.seller_canonical_facts_json === 'object'
    ? listing.seller_canonical_facts_json
    : {}
  const category = normalizeLower(firstText(
    listing.listing_category,
    listing.listing_type,
    canonicalFacts.listingType,
    canonicalFacts.listing_type,
  ))
  return category.includes('rental') || Boolean(canonicalFacts.rentalInfo || canonicalFacts.rental_info)
}

function getProperty24Reference(listing = {}, sync = null) {
  return firstText(
    sync?.listing_number,
    listing.property24_reference,
    listing.property24Reference,
  )
}

function getProperty24Status(listing = {}, sync = null) {
  return normalizeLower(firstText(
    sync?.external_status,
    listing.property24_status,
    listing.property24Status,
  ))
}

export function buildListingAgentReassignmentPlan({ listing = {}, targetAgent = {}, sync = null } = {}) {
  const listingId = normalizeProperty24Text(listing.id)
  const organisationId = firstText(listing.organisation_id, listing.organisationId)
  const previousAgentId = firstText(listing.assigned_agent_id, listing.assignedAgentId)
  const targetAgentId = firstText(targetAgent.userId, targetAgent.user_id, targetAgent.id)
  const property24Reference = getProperty24Reference(listing, sync)
  const property24Status = getProperty24Status(listing, sync)
  const property24Closed = CLOSED_PROPERTY24_STATUSES.has(property24Status)

  return {
    listingId,
    organisationId,
    previousAgentId: previousAgentId || null,
    targetAgentId,
    targetAgent: {
      userId: targetAgentId,
      membershipId: firstText(targetAgent.membershipId, targetAgent.membership_id),
      fullName: firstText(targetAgent.fullName, targetAgent.full_name, targetAgent.email),
      email: normalizeLower(targetAgent.email),
      avatarUrl: firstText(targetAgent.avatarUrl, targetAgent.avatar_url),
      phone: firstText(targetAgent.phone),
      status: normalizeLower(targetAgent.status),
    },
    listingType: isRentalListing(listing) ? 'rental' : 'sale',
    property24Reference: property24Reference || null,
    property24Status: property24Status || null,
    requiresProperty24Sync: Boolean(property24Reference && !property24Closed),
    changed: Boolean(previousAgentId !== targetAgentId),
  }
}

async function fetchProperty24ListingSync({ supabase, listingId, environment = 'exdev' } = {}) {
  const result = await supabase
    .from('property24_listing_syncs')
    .select('*')
    .eq('private_listing_id', listingId)
    .eq('environment', normalizeLower(environment) || 'exdev')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error && isMissingRelationError(result.error, 'property24_listing_syncs')) return null
  if (result.error && result.error.code !== 'PGRST116') throw result.error
  return result.data || null
}

export async function prepareProperty24ListingAgentReassignment({
  supabase,
  listingId,
  targetAgentId,
  environment = 'exdev',
} = {}) {
  if (!supabase?.from) throw reassignmentError('supabase_required', 'Supabase client is required.', 500)
  const normalizedListingId = normalizeProperty24Text(listingId)
  const normalizedTargetAgentId = normalizeProperty24Text(targetAgentId)
  if (!normalizedListingId) throw reassignmentError('listing_id_required', 'Listing ID is required.')
  if (!normalizedTargetAgentId) throw reassignmentError('target_agent_id_required', 'Choose the agent who should own this listing.')

  const listingResult = await supabase
    .from('private_listings')
    .select('*')
    .eq('id', normalizedListingId)
    .maybeSingle()
  if (listingResult.error && listingResult.error.code !== 'PGRST116') throw listingResult.error
  const listing = listingResult.data
  if (!listing?.id || !listing.organisation_id) {
    throw reassignmentError('listing_not_found', 'This listing could not be found in the current agency.', 404)
  }

  const [targetAgent, sync] = await Promise.all([
    fetchCanonicalProperty24AgentProfile({
      supabase,
      organisationId: listing.organisation_id,
      arch9UserId: normalizedTargetAgentId,
    }),
    fetchProperty24ListingSync({
      supabase,
      listingId: normalizedListingId,
      environment,
    }),
  ])

  if (!ACTIVE_AGENT_STATUSES.has(normalizeLower(targetAgent.status))) {
    throw reassignmentError(
      'arch9_agent_inactive',
      'Reactivate the Arch9 agent before assigning listings to them.',
      409,
    )
  }

  return buildListingAgentReassignmentPlan({ listing, targetAgent, sync })
}

function normalizeLegacyMapping(mapping = {}) {
  return {
    arch9UserId: firstText(mapping.arch9UserId, mapping.arch9_user_id, mapping.userId, mapping.user_id),
    arch9MembershipId: firstText(mapping.arch9MembershipId, mapping.arch9_membership_id, mapping.membershipId, mapping.membership_id),
    arch9Email: normalizeLower(firstText(mapping.arch9Email, mapping.arch9_email, mapping.email)),
    property24AgentId: positiveIntegerText(firstText(mapping.property24AgentId, mapping.property24_agent_id, mapping.agentId, mapping.agent_id)),
    sourceReference: firstText(mapping.sourceReference, mapping.source_reference),
    status: normalizeLower(firstText(mapping.matchStatus, mapping.status, 'active')),
  }
}

async function fetchLegacyTargetAgentMapping({ supabase, plan } = {}) {
  const result = await supabase
    .from('organisation_settings')
    .select('settings_json')
    .eq('organisation_id', plan.organisationId)
    .maybeSingle()
  if (result.error && result.error.code !== 'PGRST116' && !isMissingRelationError(result.error, 'organisation_settings')) {
    throw result.error
  }
  const settings = result.data?.settings_json || {}
  const property24 = settings.property24 || settings.property_24 || {}
  const mappings = Array.isArray(property24.agentMappings)
    ? property24.agentMappings
    : Array.isArray(property24.agent_mappings)
      ? property24.agent_mappings
      : []
  return mappings
    .map(normalizeLegacyMapping)
    .find((mapping) => (
      !['inactive', 'disabled'].includes(mapping.status) && (
        mapping.arch9UserId === plan.targetAgentId ||
        mapping.arch9MembershipId === plan.targetAgent.membershipId ||
        (mapping.arch9Email && mapping.arch9Email === plan.targetAgent.email)
      )
    )) || null
}

export async function resolveProperty24TargetAgentMapping({
  supabase,
  plan,
  environment = 'exdev',
} = {}) {
  if (!plan?.requiresProperty24Sync) return null
  const connection = await fetchOrganisationProperty24Connection({
    supabase,
    organisationId: plan.organisationId,
    environment,
  })
  if (!connection.enabled) {
    throw reassignmentError(
      'property24_connection_disabled',
      'Enable this agency’s Property24 connection before reassigning a live listing.',
      409,
    )
  }

  let canonicalMapping = null
  const mappingResult = await supabase
    .from('property24_agent_mappings')
    .select('*')
    .eq('organisation_id', plan.organisationId)
    .eq('environment', normalizeLower(environment) || 'exdev')
    .eq('agency_id', Number(connection.agencyId))
    .eq('arch9_user_id', plan.targetAgentId)
    .eq('status', 'active')
    .maybeSingle()
  if (mappingResult.error && !isMissingRelationError(mappingResult.error, 'property24_agent_mappings') && mappingResult.error.code !== 'PGRST116') {
    throw mappingResult.error
  }
  if (mappingResult.data) {
    canonicalMapping = {
      property24AgentId: positiveIntegerText(mappingResult.data.property24_agent_id),
      sourceReference: firstText(mappingResult.data.source_reference),
      source: 'property24_agent_mappings',
    }
  }

  const legacyMapping = canonicalMapping ? null : await fetchLegacyTargetAgentMapping({ supabase, plan })
  const mapping = canonicalMapping || (legacyMapping
    ? { ...legacyMapping, source: 'organisation_settings.property24.agentMappings' }
    : null)
  if (!mapping?.property24AgentId || !mapping.sourceReference) {
    throw reassignmentError(
      'property24_target_agent_mapping_missing',
      'Connect the new agent to their Property24 profile before reassigning this live listing.',
      409,
    )
  }

  return {
    ...mapping,
    agencyId: connection.agencyId,
    environment: connection.environment || environment,
    connection,
  }
}

function applyCurrentAgentFilter(query, currentAgentId) {
  return currentAgentId ? query.eq('assigned_agent_id', currentAgentId) : query.is('assigned_agent_id', null)
}

export async function writePrivateListingAgentAssignment({
  supabase,
  plan,
  assignedAgentId,
  expectedCurrentAgentId,
} = {}) {
  const normalizedAssignedAgentId = normalizeProperty24Text(assignedAgentId)
  let query = supabase
    .from('private_listings')
    .update({ assigned_agent_id: normalizedAssignedAgentId || null })
    .eq('id', plan.listingId)
    .eq('organisation_id', plan.organisationId)
  query = applyCurrentAgentFilter(query, normalizeProperty24Text(expectedCurrentAgentId))
  const result = await query
    .select('id, organisation_id, assigned_agent_id, listing_category, property24_reference, property24_status, updated_at')
    .maybeSingle()
  if (result.error && result.error.code !== 'PGRST116') throw result.error
  if (!result.data?.id) {
    throw reassignmentError(
      'listing_assignment_changed',
      'This listing was reassigned by someone else. Refresh and try again.',
      409,
    )
  }
  return result.data
}

export async function recordListingAgentReassignmentActivity({
  supabase,
  plan,
  actorUserId = '',
  status = 'completed',
  property24 = null,
  error = null,
} = {}) {
  const failed = status === 'failed'
  const result = await supabase
    .from('private_listing_activity')
    .insert({
      private_listing_id: plan.listingId,
      activity_type: failed ? 'listing_agent_reassignment_failed' : 'listing_agent_reassigned',
      activity_title: failed ? 'Listing agent reassignment failed' : 'Listing agent reassigned',
      activity_description: failed
        ? 'The agent change was rolled back because Property24 could not be updated.'
        : `Listing reassigned to ${plan.targetAgent.fullName || plan.targetAgent.email || 'another agent'}.`,
      performed_by: normalizeProperty24Text(actorUserId) || null,
      visibility: 'internal',
      metadata: {
        source: 'listing_agent_reassignment_v1',
        previousAgentId: plan.previousAgentId,
        targetAgentId: plan.targetAgentId,
        listingType: plan.listingType,
        property24SyncRequired: plan.requiresProperty24Sync,
        property24Status: property24?.status || null,
        property24ListingNumber: plan.property24Reference,
        rollbackApplied: failed,
        errorCode: error?.code || null,
        errorMessage: error?.message || null,
      },
    })
  if (result.error && !isMissingRelationError(result.error, 'private_listing_activity')) {
    return { saved: false, warning: result.error.message || 'Activity log could not be saved.' }
  }
  return { saved: !result.error, warning: null }
}

