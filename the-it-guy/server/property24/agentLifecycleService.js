import {
  extractProperty24AgentId,
  hashProperty24AgentPhoto,
  unwrapProperty24AgentCollection,
} from './agentPhotoService.js'
import { normalizeProperty24Text } from './client.js'
import { fetchCanonicalProperty24AgentMappings } from './agentMappingService.js'

const ALLOWED_STATUSES = new Set(['active', 'inactive'])
const CLOSED_LISTING_STATUSES = new Set([
  'withdrawn',
  'archived',
  'sold',
  'sold_archived',
  'rented',
  'completed',
  'cancelled',
  'canceled',
  'inactive',
  'deleted',
])

function lifecycleError(code, message, status = 400, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  Object.assign(error, details)
  return error
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function normalizeStatus(value = '') {
  const status = normalizeProperty24Text(value).toLowerCase()
  if (!ALLOWED_STATUSES.has(status)) {
    throw lifecycleError('property24_agent_status_invalid', 'Property24 agent status must be Active or Inactive.')
  }
  return status
}

function readAgentValue(agent = {}, ...keys) {
  for (const key of keys) {
    if (agent?.[key] !== undefined && agent?.[key] !== null && agent?.[key] !== '') return agent[key]
  }
  return ''
}

function readAgentPhotoBytes(agent = {}) {
  return normalizeProperty24Text(
    agent.profilePicture?.bytes ||
    agent.ProfilePicture?.bytes ||
    agent.profile_picture?.bytes,
  )
}

function summarizeAgent(agent = {}) {
  return {
    property24AgentId: extractProperty24AgentId(agent),
    firstName: normalizeProperty24Text(readAgentValue(agent, 'firstname', 'firstName', 'FirstName')),
    lastName: normalizeProperty24Text(readAgentValue(agent, 'lastname', 'lastName', 'LastName')),
    agencyId: positiveInteger(readAgentValue(agent, 'agencyId', 'AgencyId')),
    sourceReference: normalizeProperty24Text(readAgentValue(agent, 'sourceReference', 'SourceReference')),
    mobileNumber: normalizeProperty24Text(readAgentValue(agent, 'mobileNumber', 'MobileNumber')),
    emailAddress: normalizeProperty24Text(readAgentValue(agent, 'emailAddress', 'EmailAddress')).toLowerCase(),
    countryId: positiveInteger(readAgentValue(agent, 'countryId', 'CountryId')),
    status: normalizeProperty24Text(readAgentValue(agent, 'status', 'Status')).toLowerCase(),
    published: readAgentValue(agent, 'published', 'Published'),
    photoSha256: hashProperty24AgentPhoto(agent),
  }
}

export function buildProperty24AgentLifecycleUpdatePayload(agent = {}, targetStatus = 'inactive') {
  const normalizedStatus = normalizeStatus(targetStatus)
  const payload = {
    id: extractProperty24AgentId(agent),
    firstname: normalizeProperty24Text(readAgentValue(agent, 'firstname', 'firstName', 'FirstName')),
    lastname: normalizeProperty24Text(readAgentValue(agent, 'lastname', 'lastName', 'LastName')),
    receiveStatsMail: Boolean(readAgentValue(agent, 'receiveStatsMail', 'ReceiveStatsMail')),
    published: Boolean(readAgentValue(agent, 'published', 'Published')),
    agencyId: positiveInteger(readAgentValue(agent, 'agencyId', 'AgencyId')),
    sourceReference: normalizeProperty24Text(readAgentValue(agent, 'sourceReference', 'SourceReference')),
    mobileNumber: normalizeProperty24Text(readAgentValue(agent, 'mobileNumber', 'MobileNumber')),
    emailAddress: normalizeProperty24Text(readAgentValue(agent, 'emailAddress', 'EmailAddress')).toLowerCase(),
    countryId: positiveInteger(readAgentValue(agent, 'countryId', 'CountryId')),
    status: normalizedStatus === 'active' ? 'Active' : 'Inactive',
    jobTitle: normalizeProperty24Text(readAgentValue(agent, 'jobTitle', 'JobTitle')) || 'Agent',
    about: normalizeProperty24Text(readAgentValue(agent, 'about', 'About')),
    isBroker: Boolean(readAgentValue(agent, 'isBroker', 'IsBroker')),
  }
  const missing = ['id', 'firstname', 'lastname', 'agencyId', 'sourceReference', 'mobileNumber', 'emailAddress', 'countryId']
    .filter((key) => payload[key] === null || payload[key] === undefined || payload[key] === '')
  if (missing.length) {
    throw lifecycleError(
      'property24_agent_lifecycle_payload_incomplete',
      `Property24 agent lifecycle payload is missing: ${missing.join(', ')}.`,
    )
  }
  return payload
}

function assertAgentIdentityPreserved(before = {}, after = {}) {
  const fields = [
    'property24AgentId',
    'firstName',
    'lastName',
    'agencyId',
    'sourceReference',
    'mobileNumber',
    'emailAddress',
    'countryId',
    'published',
  ]
  const changedFields = fields.filter((field) => before[field] !== after[field])
  if (changedFields.length) {
    throw lifecycleError(
      'property24_agent_lifecycle_identity_drift',
      `Property24 changed unrelated agent fields while updating status: ${changedFields.join(', ')}.`,
      502,
      { changedFields },
    )
  }
}

async function fetchMappedAgent({ property24, agencyId, property24AgentId }) {
  const response = await property24.fetchAgencyAgents(agencyId)
  const agent = unwrapProperty24AgentCollection(response.data)
    .find((candidate) => extractProperty24AgentId(candidate) === property24AgentId) || null
  return { agent, httpStatus: response.status }
}

async function assertNoActiveAssignedListings({ supabase, organisationId, arch9UserId }) {
  const result = await supabase
    .from('private_listings')
    .select('id, listing_status, listing_visibility, title, listing_reference, property24_reference, property24_status')
    .eq('organisation_id', organisationId)
    .eq('assigned_agent_id', arch9UserId)
    .limit(5000)
  if (result.error) throw result.error
  const listings = (result.data || []).filter((listing) => {
    const status = normalizeProperty24Text(listing.listing_status).toLowerCase()
    const visibility = normalizeProperty24Text(listing.listing_visibility).toLowerCase()
    return !CLOSED_LISTING_STATUSES.has(status) && !CLOSED_LISTING_STATUSES.has(visibility)
  })
  if (listings.length) {
    throw lifecycleError(
      'agent_deactivation_listings_remaining',
      `Reassign ${listings.length} active listing${listings.length === 1 ? '' : 's'} before deactivating this agent.`,
      409,
      {
        listings: listings.map((listing) => ({
          id: listing.id,
          reference: listing.listing_reference || listing.property24_reference || null,
          title: listing.title || null,
        })),
      },
    )
  }
}

export async function syncCanonicalProperty24AgentLifecycle({
  supabase,
  property24,
  organisationId,
  environment = 'exdev',
  agencyId,
  arch9UserId,
  targetStatus,
} = {}) {
  if (!supabase?.from) throw lifecycleError('supabase_required', 'Supabase client is required.', 500)
  if (!property24?.fetchAgencyAgents || !property24?.updateAgent) {
    throw lifecycleError('property24_client_required', 'Property24 client is required.', 500)
  }
  const normalizedTargetStatus = normalizeStatus(targetStatus)
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  const normalizedUserId = normalizeProperty24Text(arch9UserId)
  const normalizedAgencyId = positiveInteger(agencyId)
  if (!normalizedOrganisationId) throw lifecycleError('organisation_id_required', 'Organisation ID is required.')
  if (!normalizedUserId) throw lifecycleError('arch9_agent_id_required', 'Arch9 agent ID is required.')
  if (!normalizedAgencyId) throw lifecycleError('property24_agency_id_invalid', 'A valid Property24 agency ID is required.')

  if (normalizedTargetStatus === 'inactive') {
    await assertNoActiveAssignedListings({
      supabase,
      organisationId: normalizedOrganisationId,
      arch9UserId: normalizedUserId,
    })
  }

  const mappings = await fetchCanonicalProperty24AgentMappings({
    supabase,
    organisationId: normalizedOrganisationId,
    environment,
    agencyId: normalizedAgencyId,
    includeInactive: true,
  })
  const mapping = mappings.find((candidate) => (
    normalizeProperty24Text(candidate.arch9_user_id) === normalizedUserId
  )) || null
  if (!mapping) {
    return {
      status: 'SKIPPED_NOT_MAPPED',
      changed: false,
      targetStatus: normalizedTargetStatus,
      arch9UserId: normalizedUserId,
      property24AgentId: null,
    }
  }

  const property24AgentId = positiveInteger(mapping.property24_agent_id)
  const beforeSnapshot = await fetchMappedAgent({ property24, agencyId: normalizedAgencyId, property24AgentId })
  if (!beforeSnapshot.agent) {
    throw lifecycleError(
      'property24_mapped_agent_not_found',
      `Mapped Property24 agent ${property24AgentId} was not returned by agency ${normalizedAgencyId}.`,
      404,
    )
  }
  const before = summarizeAgent(beforeSnapshot.agent)
  let updateHttpStatus = null
  let changed = before.status !== normalizedTargetStatus
  if (changed) {
    const payload = buildProperty24AgentLifecycleUpdatePayload(beforeSnapshot.agent, normalizedTargetStatus)
    const response = await property24.updateAgent(payload)
    updateHttpStatus = response.status
  }

  let afterSnapshot = await fetchMappedAgent({ property24, agencyId: normalizedAgencyId, property24AgentId })
  let after = summarizeAgent(afterSnapshot.agent || {})
  if (!afterSnapshot.agent || after.status !== normalizedTargetStatus) {
    throw lifecycleError(
      'property24_agent_lifecycle_not_verified',
      `Property24 agent ${property24AgentId} was not verified as ${normalizedTargetStatus}.`,
      502,
    )
  }
  assertAgentIdentityPreserved(before, after)

  let photoRestored = false
  if (before.photoSha256 && !after.photoSha256) {
    const photoBytes = readAgentPhotoBytes(beforeSnapshot.agent)
    if (!photoBytes || !property24.updateAgentProfilePicture) {
      throw lifecycleError(
        'property24_agent_photo_lost',
        `Property24 cleared agent ${property24AgentId}'s profile photo during the status update.`,
        502,
      )
    }
    await property24.updateAgentProfilePicture(property24AgentId, { bytes: photoBytes })
    photoRestored = true
    afterSnapshot = await fetchMappedAgent({ property24, agencyId: normalizedAgencyId, property24AgentId })
    after = summarizeAgent(afterSnapshot.agent || {})
    if (!after.photoSha256) {
      throw lifecycleError(
        'property24_agent_photo_restore_not_verified',
        `Property24 agent ${property24AgentId}'s profile photo could not be restored.`,
        502,
      )
    }
  }

  const mappingUpdate = await supabase
    .from('property24_agent_mappings')
    .update({ status: normalizedTargetStatus, last_seen_at: new Date().toISOString() })
    .eq('id', mapping.id)
    .select('*')
    .maybeSingle()
  if (mappingUpdate.error) throw mappingUpdate.error
  if (!mappingUpdate.data?.id || mappingUpdate.data.status !== normalizedTargetStatus) {
    throw lifecycleError('property24_agent_mapping_status_not_verified', 'Property24 agent mapping status was not verified.', 500)
  }

  return {
    status: changed ? normalizedTargetStatus.toUpperCase() : `ALREADY_${normalizedTargetStatus.toUpperCase()}`,
    changed,
    targetStatus: normalizedTargetStatus,
    arch9UserId: normalizedUserId,
    property24AgentId,
    agencyId: normalizedAgencyId,
    updateHttpStatus,
    fetchHttpStatus: afterSnapshot.httpStatus,
    photoRestored,
    agent: after,
    mapping: {
      id: mappingUpdate.data.id,
      status: mappingUpdate.data.status,
    },
  }
}
