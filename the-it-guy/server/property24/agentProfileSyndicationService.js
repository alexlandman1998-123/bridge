import {
  extractProperty24AgentId,
  findMatchingProperty24Agent,
  hashProperty24AgentPhoto,
  unwrapProperty24AgentCollection,
} from './agentPhotoService.js'
import { normalizeProperty24Text, summarizeProperty24Payload } from './client.js'

function normalizeEmail(value = '') {
  return normalizeProperty24Text(value).toLowerCase()
}

function normalizePhone(value = '') {
  return normalizeProperty24Text(value).replace(/[^0-9+]+/g, '')
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function readAgentValue(agent = {}, ...keys) {
  for (const key of keys) {
    if (agent?.[key] !== undefined && agent?.[key] !== null && agent?.[key] !== '') return agent[key]
  }
  return ''
}

function summarizeAgent(agent = {}) {
  const firstname = normalizeProperty24Text(readAgentValue(agent, 'firstname', 'firstName', 'FirstName'))
  const lastname = normalizeProperty24Text(readAgentValue(agent, 'lastname', 'lastName', 'LastName'))
  return {
    property24AgentId: extractProperty24AgentId(agent),
    agencyId: positiveInteger(readAgentValue(agent, 'agencyId', 'AgencyId')),
    sourceReference: normalizeProperty24Text(readAgentValue(agent, 'sourceReference', 'SourceReference')),
    firstName: firstname,
    lastName: lastname,
    fullName: normalizeProperty24Text(`${firstname} ${lastname}`),
    email: normalizeEmail(readAgentValue(agent, 'emailAddress', 'email', 'EmailAddress', 'Email')),
    phone: normalizePhone(readAgentValue(agent, 'mobileNumber', 'mobile', 'phoneNumber', 'MobileNumber', 'Mobile')),
    status: normalizeProperty24Text(readAgentValue(agent, 'status', 'Status')),
    published: readAgentValue(agent, 'published', 'Published'),
    photoSha256: hashProperty24AgentPhoto(agent),
  }
}

function hasCanonicalDifference(remoteAgent = {}, payload = {}) {
  const current = summarizeAgent(remoteAgent)
  return current.firstName !== payload.firstname ||
    current.lastName !== payload.lastname ||
    current.email !== normalizeEmail(payload.emailAddress) ||
    current.phone !== normalizePhone(payload.mobileNumber) ||
    current.sourceReference !== payload.sourceReference
}

export function validateCanonicalProperty24AgentProfile(profile = {}, { requirePhoto = true } = {}) {
  const missing = []
  if (!normalizeProperty24Text(profile.firstName)) missing.push('profile.firstName')
  if (!normalizeProperty24Text(profile.lastName)) missing.push('profile.lastName')
  if (!normalizeProperty24Text(profile.email)) missing.push('profile.email')
  if (!normalizePhone(profile.phone)) missing.push('profile.phone')
  if (requirePhoto && !normalizeProperty24Text(profile.avatarUrl)) missing.push('profile.avatarUrl')

  const invalid = []
  const email = normalizeEmail(profile.email)
  const phone = normalizePhone(profile.phone)
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.endsWith('.test'))) invalid.push('profile.email')
  if (phone && !/^\+?\d{10,15}$/.test(phone)) invalid.push('profile.phone')
  return { missing, invalid }
}

export function buildCanonicalProperty24AgentUpdatePayload({
  profile = {},
  remoteAgent = {},
  agencyId,
  sourceReference,
  countryId = 1,
} = {}) {
  const property24AgentId = extractProperty24AgentId(remoteAgent)
  const payload = {
    id: property24AgentId,
    firstname: normalizeProperty24Text(profile.firstName),
    lastname: normalizeProperty24Text(profile.lastName),
    receiveStatsMail: Boolean(readAgentValue(remoteAgent, 'receiveStatsMail', 'ReceiveStatsMail')),
    published: readAgentValue(remoteAgent, 'published', 'Published') === ''
      ? true
      : Boolean(readAgentValue(remoteAgent, 'published', 'Published')),
    agencyId: positiveInteger(agencyId || readAgentValue(remoteAgent, 'agencyId', 'AgencyId')),
    sourceReference: normalizeProperty24Text(sourceReference || readAgentValue(remoteAgent, 'sourceReference', 'SourceReference')),
    mobileNumber: normalizePhone(profile.phone),
    emailAddress: normalizeEmail(profile.email),
    countryId: positiveInteger(readAgentValue(remoteAgent, 'countryId', 'CountryId')) || positiveInteger(countryId),
    status: normalizeProperty24Text(readAgentValue(remoteAgent, 'status', 'Status')) || 'Active',
    jobTitle: normalizeProperty24Text(profile.jobTitle || readAgentValue(remoteAgent, 'jobTitle', 'JobTitle')) || 'Agent',
    about: normalizeProperty24Text(readAgentValue(remoteAgent, 'about', 'About')),
    isBroker: Boolean(readAgentValue(remoteAgent, 'isBroker', 'IsBroker')),
  }
  const missing = ['id', 'firstname', 'lastname', 'agencyId', 'sourceReference', 'mobileNumber', 'emailAddress', 'countryId', 'status']
    .filter((key) => payload[key] === null || payload[key] === undefined || payload[key] === '')
  if (missing.length) {
    const error = new Error(`Property24 agent update payload is missing: ${missing.join(', ')}.`)
    error.code = 'property24_agent_update_payload_incomplete'
    error.status = 400
    throw error
  }
  return payload
}

function buildCanonicalProperty24AgentCreatePayload({ profile = {}, agencyId, sourceReference, countryId = 1 } = {}) {
  return {
    firstname: normalizeProperty24Text(profile.firstName),
    lastname: normalizeProperty24Text(profile.lastName),
    receiveStatsMail: false,
    published: true,
    agencyId: positiveInteger(agencyId),
    sourceReference: normalizeProperty24Text(sourceReference),
    mobileNumber: normalizePhone(profile.phone),
    emailAddress: normalizeEmail(profile.email),
    countryId: positiveInteger(countryId),
    status: 'Active',
    jobTitle: normalizeProperty24Text(profile.jobTitle) || 'Agent',
  }
}

function verifyCanonicalProfile(agent, profile, preparedPhoto) {
  const summary = summarizeAgent(agent)
  const mismatches = []
  if (summary.firstName !== normalizeProperty24Text(profile.firstName)) mismatches.push('firstName')
  if (summary.lastName !== normalizeProperty24Text(profile.lastName)) mismatches.push('lastName')
  if (summary.email !== normalizeEmail(profile.email)) mismatches.push('email')
  if (summary.phone !== normalizePhone(profile.phone)) mismatches.push('phone')
  if (!summary.photoSha256) mismatches.push('photo')
  else if (preparedPhoto?.summary?.sha256 && summary.photoSha256 !== preparedPhoto.summary.sha256) mismatches.push('photoHash')
  return { summary, mismatches, verified: mismatches.length === 0 }
}

export async function syndicateCanonicalProperty24AgentProfile({
  property24,
  profile,
  preparedPhoto,
  agencyId,
  sourceReference,
  countryId = 1,
  remoteAgent = null,
} = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  if (!preparedPhoto?.payload?.bytes || !preparedPhoto?.summary?.sha256) {
    throw new Error('A prepared Arch9 agent profile photo is required.')
  }
  const readiness = validateCanonicalProperty24AgentProfile(profile)
  if (readiness.missing.length || readiness.invalid.length) {
    const error = new Error('The Arch9 agent profile is not ready for Property24 syndication.')
    error.code = 'property24_agent_profile_not_ready'
    error.status = 400
    error.missingFields = readiness.missing
    error.invalidFields = readiness.invalid
    throw error
  }

  const warnings = []
  let agent = remoteAgent
  let created = false
  let profileUpdated = false
  let agentId = extractProperty24AgentId(agent)
  let profileHttpStatus = null
  let photoHttpStatus = null

  if (agentId) {
    const updatePayload = buildCanonicalProperty24AgentUpdatePayload({ profile, remoteAgent: agent, agencyId, sourceReference, countryId })
    if (hasCanonicalDifference(agent, updatePayload)) {
      const update = await property24.updateAgent(updatePayload)
      profileUpdated = true
      profileHttpStatus = update.status
    }
  } else {
    const createPayload = buildCanonicalProperty24AgentCreatePayload({ profile, agencyId, sourceReference, countryId })
    const create = await property24.createAgent(createPayload)
    created = true
    profileHttpStatus = create.status
    agentId = extractProperty24AgentId(create.data)
    if (!agentId) {
      const postCreateSnapshot = await property24.fetchAgencyAgents(agencyId)
      agent = findMatchingProperty24Agent(postCreateSnapshot.data, createPayload)
      agentId = extractProperty24AgentId(agent)
    }
    if (!agentId) {
      const error = new Error('Property24 created the agent but did not return a usable agent ID. Sync agents before retrying; do not create the agent again.')
      error.code = 'property24_agent_id_missing_after_create'
      error.status = 502
      error.created = true
      error.responseBody = summarizeProperty24Payload(create.data)
      throw error
    }
  }

  const sourcePhotoHash = preparedPhoto.summary.sha256
  const remotePhotoHash = hashProperty24AgentPhoto(agent || remoteAgent)
  if (created || profileUpdated || remotePhotoHash !== sourcePhotoHash) {
    try {
      const photo = await property24.updateAgentProfilePicture(agentId, preparedPhoto.payload)
      photoHttpStatus = photo.status
    } catch (error) {
      warnings.push({
        code: 'property24_agent_photo_upload_failed',
        message: error.message,
        httpStatus: error.status || null,
      })
    }
  }

  let verification = null
  try {
    const finalSnapshot = await property24.fetchAgencyAgents(agencyId)
    const finalAgent = unwrapProperty24AgentCollection(finalSnapshot.data)
      .find((candidate) => extractProperty24AgentId(candidate) === agentId) || null
    if (!finalAgent) {
      warnings.push({ code: 'property24_agent_verification_missing', message: `Property24 agent ${agentId} was not returned during verification.` })
    } else {
      verification = verifyCanonicalProfile(finalAgent, profile, preparedPhoto)
      if (!verification.verified) {
        warnings.push({
          code: 'property24_agent_verification_mismatch',
          message: `Property24 verification still differs on: ${verification.mismatches.join(', ')}.`,
          fields: verification.mismatches,
        })
      }
    }
  } catch (error) {
    warnings.push({ code: 'property24_agent_verification_failed', message: error.message, httpStatus: error.status || null })
  }

  const action = created ? 'CREATED' : profileUpdated || photoHttpStatus ? 'UPDATED' : 'UNCHANGED'
  return {
    status: warnings.length ? `${action}_PARTIAL` : action,
    property24AgentId: agentId,
    action,
    profileUpdated,
    photoUploaded: Boolean(photoHttpStatus),
    profileHttpStatus,
    photoHttpStatus,
    photo: {
      sourceSha256: sourcePhotoHash,
      remoteSha256: verification?.summary?.photoSha256 || '',
      verified: Boolean(verification?.summary?.photoSha256 && verification.summary.photoSha256 === sourcePhotoHash),
      outputMimeType: preparedPhoto.summary.outputMimeType,
      outputWidth: preparedPhoto.summary.outputWidth,
      outputHeight: preparedPhoto.summary.outputHeight,
    },
    agent: verification?.summary || {
      property24AgentId: agentId,
      agencyId: positiveInteger(agencyId),
      sourceReference: normalizeProperty24Text(sourceReference),
      firstName: normalizeProperty24Text(profile.firstName),
      lastName: normalizeProperty24Text(profile.lastName),
      fullName: normalizeProperty24Text(profile.fullName || `${profile.firstName} ${profile.lastName}`),
      email: normalizeEmail(profile.email),
      phone: normalizePhone(profile.phone),
      status: 'Active',
    },
    warnings,
  }
}
