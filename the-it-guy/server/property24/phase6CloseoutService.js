import crypto from 'node:crypto'
import { unwrapProperty24AgentCollection } from './agentPhotoService.js'
import { normalizeProperty24Text, summarizeProperty24Payload } from '../services/property24Client.js'

export const PROPERTY24_PHASE6 = Object.freeze({
  environment: 'exdev',
  agencyId: 31382,
  listings: Object.freeze([
    Object.freeze({
      key: 'rental',
      listingNumber: 100314819,
      listingType: 'Rental',
      sourceReference: 'ARCH9-VET-PHASE2-RENT-NEWLANDS',
      targetStatus: 'Rented',
    }),
    Object.freeze({
      key: 'sale',
      listingNumber: 100314820,
      listingType: 'Sale',
      sourceReference: 'ARCH9-VET-PHASE2-SALE-SANDTON',
      targetStatus: 'Sold',
    }),
  ]),
  agents: Object.freeze([
    Object.freeze({
      key: 'jon',
      agentId: 77969,
      firstname: 'Jon',
      lastname: 'Snow',
      sourceReference: 'ARCH9-VET-JON-SNOW',
    }),
    Object.freeze({
      key: 'pauly',
      agentId: 77970,
      firstname: 'Pauly',
      lastname: 'Shore',
      sourceReference: 'ARCH9-VET-PAULY-SHORE',
    }),
  ]),
})

const OPEN_LISTING_STATUSES = new Set(['active', 'newlisting', 'pending', 'backonmarket'])

function normalizeKey(value) {
  return normalizeProperty24Text(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function readAgentId(agent = {}) {
  return positiveInteger(agent.id || agent.agentId || agent.AgentId || agent.Id)
}

function readListingNumber(listing = {}) {
  return positiveInteger(listing.listingNumber || listing.ListingNumber || listing.id || listing.Id)
}

function unwrapListingCollection(value) {
  if (Array.isArray(value)) return value
  for (const key of ['listings', 'items', 'data']) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

function unwrapPortalState(value) {
  if (typeof value === 'boolean') return value
  return Boolean(value?.isOnPortal ?? value?.IsOnPortal)
}

function photoBytes(agent = {}) {
  return normalizeProperty24Text(agent.profilePicture?.bytes || agent.ProfilePicture?.bytes)
}

function photoHash(agent = {}) {
  const bytes = photoBytes(agent)
  return bytes ? crypto.createHash('sha256').update(Buffer.from(bytes, 'base64')).digest('hex') : null
}

function summarizeAgent(agent = {}) {
  return {
    agentId: readAgentId(agent),
    firstname: normalizeProperty24Text(agent.firstname || agent.firstName),
    lastname: normalizeProperty24Text(agent.lastname || agent.lastName),
    agencyId: positiveInteger(agent.agencyId || agent.AgencyId),
    sourceReference: normalizeProperty24Text(agent.sourceReference || agent.SourceReference),
    mobileNumber: normalizeProperty24Text(agent.mobileNumber || agent.MobileNumber),
    emailAddress: normalizeProperty24Text(agent.emailAddress || agent.EmailAddress),
    countryId: positiveInteger(agent.countryId || agent.CountryId),
    status: normalizeProperty24Text(agent.status || agent.Status),
    published: agent.published ?? agent.Published ?? null,
    profilePictureSha256: photoHash(agent),
  }
}

function assertAgentIdentity(agent, expected) {
  if (!agent) throw new Error(`Property24 agent ${expected.agentId} was not returned by agency ${PROPERTY24_PHASE6.agencyId}.`)
  const summary = summarizeAgent(agent)
  if (
    summary.agentId !== expected.agentId ||
    summary.firstname !== expected.firstname ||
    summary.lastname !== expected.lastname ||
    summary.agencyId !== PROPERTY24_PHASE6.agencyId ||
    summary.sourceReference !== expected.sourceReference
  ) {
    throw new Error(`Property24 agent ${expected.agentId} identity does not match the locked Phase 6 record.`)
  }
  if (!['active', 'inactive'].includes(normalizeKey(summary.status))) {
    throw new Error(`Property24 agent ${expected.agentId} has unexpected status "${summary.status}".`)
  }
  return summary
}

function buildAgentUpdatePayload(agent, overrides = {}) {
  const payload = {
    id: readAgentId(agent),
    firstname: normalizeProperty24Text(agent.firstname || agent.firstName),
    lastname: normalizeProperty24Text(agent.lastname || agent.lastName),
    receiveStatsMail: Boolean(agent.receiveStatsMail),
    published: Boolean(agent.published),
    agencyId: positiveInteger(agent.agencyId || agent.AgencyId),
    sourceReference: normalizeProperty24Text(agent.sourceReference || agent.SourceReference),
    mobileNumber: normalizeProperty24Text(agent.mobileNumber || agent.MobileNumber),
    emailAddress: normalizeProperty24Text(agent.emailAddress || agent.EmailAddress),
    countryId: positiveInteger(agent.countryId || agent.CountryId),
    status: normalizeProperty24Text(agent.status || agent.Status),
    jobTitle: normalizeProperty24Text(agent.jobTitle),
    about: normalizeProperty24Text(agent.about),
    isBroker: Boolean(agent.isBroker),
    ...overrides,
  }
  const missing = ['id', 'firstname', 'lastname', 'agencyId', 'sourceReference', 'mobileNumber', 'emailAddress', 'countryId', 'status']
    .filter((key) => payload[key] === null || payload[key] === undefined || payload[key] === '')
  if (missing.length) throw new Error(`Agent ${payload.id || 'unknown'} update payload is missing: ${missing.join(', ')}.`)
  return payload
}

function assertOnlyAgentStatusChanged(before, after) {
  const fields = ['agentId', 'firstname', 'lastname', 'agencyId', 'sourceReference', 'mobileNumber', 'emailAddress', 'countryId', 'published']
  const drift = fields.filter((field) => before[field] !== after[field])
  if (drift.length) throw new Error(`Unexpected agent field changes detected: ${drift.join(', ')}.`)
}

function buildError(error, step) {
  return {
    step,
    name: error.name || 'Error',
    message: error.message,
    httpStatus: error.status || null,
    response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  }
}

async function fetchAgents(property24) {
  const response = await property24.fetchAgencyAgents(PROPERTY24_PHASE6.agencyId)
  const rows = unwrapProperty24AgentCollection(response.data)
  const agents = {}
  for (const expected of PROPERTY24_PHASE6.agents) {
    const row = rows.find((agent) => readAgentId(agent) === expected.agentId) || null
    agents[expected.key] = {
      row,
      summary: assertAgentIdentity(row, expected),
    }
  }
  return { httpStatus: response.status, agents }
}

async function fetchListings(property24, fromDate) {
  const [reconciliation, updates, ...portalResponses] = await Promise.all([
    property24.fetchListingReconciliation({ agencyId: PROPERTY24_PHASE6.agencyId }),
    property24.fetchListingUpdates(fromDate),
    ...PROPERTY24_PHASE6.listings.map((listing) => property24.checkListingOnPortal(listing.listingNumber)),
  ])
  const reconciliationRows = unwrapListingCollection(reconciliation.data)
  const updateRows = unwrapListingCollection(updates.data)
  const listings = {}
  PROPERTY24_PHASE6.listings.forEach((expected, index) => {
    const reconciliationRow = reconciliationRows.find((row) => readListingNumber(row) === expected.listingNumber) || null
    const updateRow = updateRows.find((row) => readListingNumber(row) === expected.listingNumber) || null
    const status = normalizeProperty24Text(
      updateRow?.currentStatus || updateRow?.CurrentStatus ||
      reconciliationRow?.status || reconciliationRow?.Status,
    )
    const portalResponse = portalResponses[index]
    listings[expected.key] = {
      listingNumber: expected.listingNumber,
      listingType: expected.listingType,
      sourceReference: expected.sourceReference,
      targetStatus: expected.targetStatus,
      status,
      isOnPortal: unwrapPortalState(portalResponse.data),
      updateReasonType: normalizeProperty24Text(updateRow?.reasonType || updateRow?.ReasonType) || null,
      updateComment: normalizeProperty24Text(updateRow?.comment || updateRow?.Comment) || null,
      httpStatus: {
        reconciliation: reconciliation.status,
        updates: updates.status,
        portal: portalResponse.status,
      },
    }
  })
  return listings
}

function assertSafeListingState(listing) {
  const status = normalizeKey(listing.status)
  const target = normalizeKey(listing.targetStatus)
  if (!status) throw new Error(`Listing ${listing.listingNumber} did not return a current status.`)
  if (status !== target && !OPEN_LISTING_STATUSES.has(status)) {
    throw new Error(`Listing ${listing.listingNumber} has unexpected status "${listing.status}"; expected an open state or ${listing.targetStatus}.`)
  }
  if (status === target && listing.isOnPortal) {
    throw new Error(`Listing ${listing.listingNumber} is already ${listing.targetStatus} but still reports as on-portal.`)
  }
}

function listingReachedTarget(listing) {
  return normalizeKey(listing.status) === normalizeKey(listing.targetStatus) && !listing.isOnPortal
}

async function verifyListing(property24, expected, fromDate, {
  attempts = 6,
  delayMs = 1_500,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  let snapshot = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    snapshot = (await fetchListings(property24, fromDate))[expected.key]
    if (listingReachedTarget(snapshot)) return { verified: true, attempts: attempt, snapshot }
    if (attempt < attempts) await wait(delayMs)
  }
  return { verified: false, attempts, snapshot }
}

async function restoreAgentPhotoIfNeeded(property24, beforeRow, afterAgents, expected) {
  const beforeHash = photoHash(beforeRow)
  const afterHash = afterAgents.agents[expected.key].summary.profilePictureSha256
  if (!beforeHash || beforeHash === afterHash) return { agents: afterAgents, restored: false, httpStatus: null }
  const bytes = photoBytes(beforeRow)
  if (!bytes) throw new Error(`${expected.firstname}’s profile picture bytes were unavailable for preservation.`)
  const response = await property24.updateAgentProfilePicture(expected.agentId, { bytes })
  const refreshed = await fetchAgents(property24)
  if (!refreshed.agents[expected.key].summary.profilePictureSha256) {
    throw new Error(`${expected.firstname}’s profile picture was not restored after deactivation.`)
  }
  return { agents: refreshed, restored: true, httpStatus: response.status }
}

async function deactivateAgent(property24, currentAgents, expected) {
  const current = currentAgents.agents[expected.key]
  if (normalizeKey(current.summary.status) === 'inactive') {
    return {
      agents: currentAgents,
      result: { step: `deactivate_${expected.key}`, status: 'ALREADY_INACTIVE', agentId: expected.agentId },
    }
  }
  const payload = buildAgentUpdatePayload(current.row, { status: 'Inactive' })
  const response = await property24.updateAgent(payload)
  let refreshed = await fetchAgents(property24)
  const after = refreshed.agents[expected.key].summary
  if (normalizeKey(after.status) !== 'inactive') throw new Error(`${expected.firstname} was not confirmed as inactive.`)
  assertOnlyAgentStatusChanged(current.summary, after)
  const photo = await restoreAgentPhotoIfNeeded(property24, current.row, refreshed, expected)
  refreshed = photo.agents
  return {
    agents: refreshed,
    result: {
      step: `deactivate_${expected.key}`,
      status: 'INACTIVE',
      agentId: expected.agentId,
      httpStatus: response.status,
      profilePictureRestored: photo.restored,
      profilePictureRestoreHttpStatus: photo.httpStatus,
    },
  }
}

export async function executeProperty24Phase6Closeout({
  property24,
  apply = false,
  fromDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1_000).toISOString(),
  wait,
} = {}) {
  if (!property24) throw new Error('A Property24 client is required.')
  const completed = []
  let currentStep = 'preflight'
  try {
    let agents = await fetchAgents(property24)
    const listings = await fetchListings(property24, fromDate)
    for (const expected of PROPERTY24_PHASE6.listings) assertSafeListingState(listings[expected.key])
    const preflight = {
      agencyId: PROPERTY24_PHASE6.agencyId,
      fromDate,
      agents: Object.fromEntries(Object.entries(agents.agents).map(([key, value]) => [key, value.summary])),
      listings,
      actions: {
        listingStatuses: PROPERTY24_PHASE6.listings.map((listing) => ({ listingNumber: listing.listingNumber, listingType: listing.listingType, targetStatus: listing.targetStatus })),
        agentStatuses: PROPERTY24_PHASE6.agents.map((agent) => ({ agentId: agent.agentId, name: `${agent.firstname} ${agent.lastname}`, targetStatus: 'Inactive' })),
      },
    }
    if (!apply) {
      return {
        status: 'PHASE6_DRY_RUN_READY',
        environment: PROPERTY24_PHASE6.environment,
        message: 'Phase 6 identities and starting states are verified. No Property24 write was made.',
        preflight,
      }
    }

    for (const expected of PROPERTY24_PHASE6.listings) {
      currentStep = `close_${expected.key}_listing`
      if (listingReachedTarget(listings[expected.key])) {
        completed.push({ step: currentStep, status: 'ALREADY_CLOSED', listingNumber: expected.listingNumber, listingStatus: expected.targetStatus })
      } else {
        const response = await property24.updateListingStatus(expected.listingNumber, expected.targetStatus)
        completed.push({ step: currentStep, status: 'UPDATE_ACCEPTED', listingNumber: expected.listingNumber, listingStatus: expected.targetStatus, httpStatus: response.status })
      }
      currentStep = `verify_${expected.key}_listing`
      const verification = await verifyListing(property24, expected, fromDate, { wait })
      if (!verification.verified) {
        throw new Error(`Listing ${expected.listingNumber} was not confirmed as ${expected.targetStatus} and off-portal. Agents were not deactivated.`)
      }
      completed.push({ step: currentStep, status: 'VERIFIED', listingNumber: expected.listingNumber, listingStatus: expected.targetStatus, verification })
    }

    currentStep = 'verify_all_listings_closed'
    const closedListings = await fetchListings(property24, fromDate)
    for (const expected of PROPERTY24_PHASE6.listings) {
      if (!listingReachedTarget(closedListings[expected.key])) {
        throw new Error(`Listing ${expected.listingNumber} lost its verified ${expected.targetStatus} off-portal state. Agents were not deactivated.`)
      }
    }
    completed.push({ step: currentStep, status: 'VERIFIED' })

    agents = await fetchAgents(property24)
    for (const expected of PROPERTY24_PHASE6.agents) {
      currentStep = `deactivate_${expected.key}`
      const deactivation = await deactivateAgent(property24, agents, expected)
      agents = deactivation.agents
      completed.push(deactivation.result)
    }

    currentStep = 'final_verification'
    const [finalAgents, finalListings] = await Promise.all([
      fetchAgents(property24),
      fetchListings(property24, fromDate),
    ])
    for (const expected of PROPERTY24_PHASE6.agents) {
      if (normalizeKey(finalAgents.agents[expected.key].summary.status) !== 'inactive') throw new Error(`${expected.firstname} is not inactive in final verification.`)
    }
    for (const expected of PROPERTY24_PHASE6.listings) {
      if (!listingReachedTarget(finalListings[expected.key])) throw new Error(`Listing ${expected.listingNumber} failed final Phase 6 verification.`)
    }
    completed.push({ step: currentStep, status: 'VERIFIED' })
    return {
      status: 'PHASE6_COMPLETE',
      environment: PROPERTY24_PHASE6.environment,
      agencyId: PROPERTY24_PHASE6.agencyId,
      completed,
      preflight,
      final: {
        agents: Object.fromEntries(Object.entries(finalAgents.agents).map(([key, value]) => [key, value.summary])),
        listings: finalListings,
      },
    }
  } catch (error) {
    return {
      status: completed.length ? 'PHASE6_PARTIAL_FAILURE' : 'PHASE6_BLOCKED',
      environment: PROPERTY24_PHASE6.environment,
      agencyId: PROPERTY24_PHASE6.agencyId,
      completed,
      error: buildError(error, currentStep),
      safety: completed.some((item) => item.step === 'verify_all_listings_closed')
        ? 'Both listings were verified closed before agent deactivation began.'
        : 'Agent deactivation did not begin because both listing closures were not yet verified.',
    }
  }
}
