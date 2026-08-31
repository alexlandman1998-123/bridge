import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  prepareProperty24AgentPhotoFile,
  unwrapProperty24AgentCollection,
} from '../server/property24/agentPhotoService.js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../server/services/property24Client.js'
import { createRedactedProperty24Payload } from '../server/property24/publishService.js'
import {
  PHASE2,
  buildSalePlan,
  extractListingNumber,
  loadCurrentDefinition,
  persistCurrentDefinition,
} from './property24-phase2-exdev-listings.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = fileURLToPath(new URL('..', import.meta.url))
const phase3StatePath = path.join(appRoot, 'artifacts/property24-vetting/phase3-state.json')

export const PHASE3 = Object.freeze({
  agencyId: 31382,
  jon: {
    agentId: 77969,
    firstname: 'Jon',
    lastname: 'Snow',
    sourceReference: 'ARCH9-VET-JON-SNOW',
    replacementTelephoneSuffix: '1123',
  },
  pauly: {
    agentId: 77970,
    firstname: 'Pauly',
    lastname: 'Shore',
    sourceReference: 'ARCH9-VET-PAULY-SHORE',
  },
  listingNumber: 100314820,
  defaultPhoto: 'artifacts/property24-vetting/phase3-pauly-shore-headshot.png',
})

function parseArgs(argv) {
  const options = { apply: false, photo: PHASE3.defaultPhoto }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg.startsWith('--photo=')) options.photo = normalizeProperty24Text(arg.slice('--photo='.length))
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadConfig() {
  const files = ['.env', '.env.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)))
  const env = { ...fromFiles, ...processOverrides }
  const config = {
    baseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    userGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
  }
  config.missing = []
  if (!config.username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  return config
}

async function readPhase3State() {
  let parsed
  try {
    parsed = JSON.parse(await fs.promises.readFile(phase3StatePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        version: 1,
        agencyId: PHASE3.agencyId,
        paulyAgentId: PHASE3.pauly.agentId,
        profilePicture: {},
      }
    }
    throw new Error(`Could not read Phase 3 state: ${error.message}`)
  }
  if (
    !parsed ||
    parsed.version !== 1 ||
    Number(parsed.agencyId) !== PHASE3.agencyId ||
    Number(parsed.paulyAgentId) !== PHASE3.pauly.agentId ||
    !parsed.profilePicture
  ) {
    throw new Error(`Invalid Phase 3 state at ${phase3StatePath}.`)
  }
  return parsed
}

async function persistPhase3State(state) {
  const temporaryPath = `${phase3StatePath}.${process.pid}.tmp`
  await fs.promises.mkdir(path.dirname(phase3StatePath), { recursive: true })
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fs.promises.rename(temporaryPath, phase3StatePath)
  } finally {
    await fs.promises.unlink(temporaryPath).catch(() => {})
  }
}

function readAgentId(agent = {}) {
  const value = Number(agent.id || agent.agentId || agent.AgentId || agent.Id)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function findAgent(value, agentId) {
  return unwrapProperty24AgentCollection(value).find((agent) => readAgentId(agent) === agentId) || null
}

function hashBase64Bytes(bytes = '') {
  const value = normalizeProperty24Text(bytes)
  if (!value) return null
  return crypto.createHash('sha256').update(Buffer.from(value, 'base64')).digest('hex')
}

function getAgentPhotoHash(agent = {}) {
  return hashBase64Bytes(agent.profilePicture?.bytes || agent.ProfilePicture?.bytes)
}

function summarizeAgent(agent = {}) {
  return {
    agentId: readAgentId(agent),
    firstname: agent.firstname || agent.firstName || null,
    lastname: agent.lastname || agent.lastName || null,
    agencyId: Number(agent.agencyId) || null,
    sourceReference: agent.sourceReference || null,
    mobileNumber: agent.mobileNumber || null,
    emailAddress: agent.emailAddress || null,
    status: agent.status || null,
    published: agent.published ?? null,
    profilePictureSha256: getAgentPhotoHash(agent),
  }
}

function assertAgentIdentity(agent, expected) {
  if (!agent) throw new Error(`Property24 agent ${expected.agentId} was not returned by agency ${PHASE3.agencyId}.`)
  const actual = summarizeAgent(agent)
  if (
    actual.agentId !== expected.agentId ||
    actual.firstname !== expected.firstname ||
    actual.lastname !== expected.lastname ||
    actual.agencyId !== PHASE3.agencyId ||
    actual.sourceReference !== expected.sourceReference
  ) {
    throw new Error(`Property24 agent ${expected.agentId} identity does not match the locked Phase 3 record.`)
  }
  return actual
}

export function replaceLastFourTelephoneDigits(value, replacement = '1123') {
  const characters = [...normalizeProperty24Text(value)]
  const digitIndexes = characters.map((character, index) => (/\d/.test(character) ? index : null)).filter((index) => index !== null)
  if (digitIndexes.length < 4 || !/^\d{4}$/.test(replacement)) {
    throw new Error('Jon’s telephone number must contain at least four digits and the replacement must contain exactly four digits.')
  }
  digitIndexes.slice(-4).forEach((index, offset) => {
    characters[index] = replacement[offset]
  })
  return characters.join('')
}

function buildAgentUpdatePayload(agent, overrides = {}) {
  const payload = {
    id: readAgentId(agent),
    firstname: normalizeProperty24Text(agent.firstname || agent.firstName),
    lastname: normalizeProperty24Text(agent.lastname || agent.lastName),
    receiveStatsMail: Boolean(agent.receiveStatsMail),
    published: Boolean(agent.published),
    agencyId: Number(agent.agencyId),
    sourceReference: normalizeProperty24Text(agent.sourceReference),
    mobileNumber: normalizeProperty24Text(agent.mobileNumber),
    emailAddress: normalizeProperty24Text(agent.emailAddress),
    countryId: Number(agent.countryId),
    status: normalizeProperty24Text(agent.status),
    jobTitle: normalizeProperty24Text(agent.jobTitle),
    about: normalizeProperty24Text(agent.about),
    isBroker: Boolean(agent.isBroker),
    ...overrides,
  }
  const required = ['id', 'firstname', 'lastname', 'agencyId', 'sourceReference', 'mobileNumber', 'emailAddress', 'countryId', 'status']
  const missing = required.filter((key) => payload[key] === '' || payload[key] === null || payload[key] === undefined || Number.isNaN(payload[key]))
  if (missing.length) throw new Error(`Agent update payload is missing: ${missing.join(', ')}.`)
  return payload
}

function collectListingNumbers(value) {
  if (Array.isArray(value)) return value.flatMap(collectListingNumbers)
  if (!value || typeof value !== 'object') return []
  const direct = extractListingNumber(value)
  const nested = Object.values(value).flatMap(collectListingNumbers)
  return [...new Set([...(direct ? [direct] : []), ...nested])]
}

function reconciliationHasListing(value, listingNumber) {
  return collectListingNumbers(value).includes(listingNumber)
}

async function fetchAgents(property24) {
  const result = await property24.fetchAgencyAgents(PHASE3.agencyId)
  const jon = findAgent(result.data, PHASE3.jon.agentId)
  const pauly = findAgent(result.data, PHASE3.pauly.agentId)
  return {
    httpStatus: result.status,
    raw: result.data,
    jon,
    pauly,
    jonSummary: assertAgentIdentity(jon, PHASE3.jon),
    paulySummary: assertAgentIdentity(pauly, PHASE3.pauly),
  }
}

async function fetchAssignment(property24) {
  const [jon, pauly, portal] = await Promise.all([
    property24.fetchListingReconciliation({ agentId: PHASE3.jon.agentId }),
    property24.fetchListingReconciliation({ agentId: PHASE3.pauly.agentId }),
    property24.checkListingOnPortal(PHASE3.listingNumber),
  ])
  return {
    jonHasListing: reconciliationHasListing(jon.data, PHASE3.listingNumber),
    paulyHasListing: reconciliationHasListing(pauly.data, PHASE3.listingNumber),
    isOnPortal: typeof portal.data === 'boolean'
      ? portal.data
      : Boolean(portal.data?.isOnPortal ?? portal.data?.IsOnPortal),
    httpStatus: {
      jonReconciliation: jon.status,
      paulyReconciliation: pauly.status,
      portal: portal.status,
    },
  }
}

async function verifyAssignment(property24, {
  attempts = 6,
  delayMs = 1500,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  let snapshot = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    snapshot = await fetchAssignment(property24)
    if (!snapshot.jonHasListing && snapshot.paulyHasListing && snapshot.isOnPortal) {
      return { verified: true, attempts: attempt, ...snapshot }
    }
    if (attempt < attempts) await wait(delayMs)
  }
  return { verified: false, attempts, ...snapshot }
}

function ensureValidStartingAssignment(assignment, jonStatus) {
  if (assignment.jonHasListing && assignment.paulyHasListing) {
    throw new Error(`Listing ${PHASE3.listingNumber} appears under both agents; no write is safe.`)
  }
  if (!assignment.jonHasListing && !assignment.paulyHasListing) {
    throw new Error(`Listing ${PHASE3.listingNumber} could not be resolved under Jon or Pauly; no write is safe.`)
  }
  if (normalizeProperty24Text(jonStatus).toLowerCase() === 'inactive' && assignment.jonHasListing) {
    throw new Error('Jon is already inactive while still owning the listing; manual recovery is required.')
  }
}

function assertOnlyExpectedAgentFieldsChanged(before, after, allowedKeys = []) {
  const allowed = new Set(allowedKeys)
  const keys = ['agentId', 'firstname', 'lastname', 'agencyId', 'sourceReference', 'mobileNumber', 'emailAddress', 'status', 'published']
  const drift = keys.filter((key) => !allowed.has(key) && before[key] !== after[key])
  if (drift.length) throw new Error(`Unexpected agent field changes detected: ${drift.join(', ')}.`)
}

async function preserveAgentProfilePicture(property24, beforeAgent, afterAgents, expected) {
  const beforeHash = getAgentPhotoHash(beforeAgent)
  const afterHash = afterAgents.jonSummary.profilePictureSha256
  if (beforeHash && beforeHash === afterHash) return { agents: afterAgents, restored: false, httpStatus: null }

  const bytes = normalizeProperty24Text(beforeAgent?.profilePicture?.bytes || beforeAgent?.ProfilePicture?.bytes)
  if (!bytes) throw new Error(`${expected.firstname}’s existing profile picture could not be preserved because its bytes were unavailable.`)
  const result = await property24.updateAgentProfilePicture(expected.agentId, { bytes })
  const restoredAgents = await fetchAgents(property24)
  if (!restoredAgents.jonSummary.profilePictureSha256) {
    throw new Error(`${expected.firstname}’s profile picture was not restored after the agent update.`)
  }
  return { agents: restoredAgents, restored: true, httpStatus: result.status }
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

export async function executePhase3Workflow({
  property24,
  photo,
  apply = false,
  loadSale = loadCurrentDefinition,
  persistSale = persistCurrentDefinition,
  loadOperationState = readPhase3State,
  persistOperationState = persistPhase3State,
  wait,
} = {}) {
  if (!property24) throw new Error('A Property24 client is required.')
  if (!photo?.payload?.bytes || !photo?.summary) throw new Error('A prepared Pauly profile photo is required.')

  const completed = []
  let currentStep = 'preflight'
  try {
    const agents = await fetchAgents(property24)
    const assignment = await fetchAssignment(property24)
    ensureValidStartingAssignment(assignment, agents.jonSummary.status)
    if (normalizeProperty24Text(agents.paulySummary.status).toLowerCase() !== 'active') {
      throw new Error('Pauly must remain active before receiving Jon’s listing.')
    }

    const targetTelephone = replaceLastFourTelephoneDigits(
      agents.jonSummary.mobileNumber,
      PHASE3.jon.replacementTelephoneSuffix,
    )
    const targetPhotoSha256 = hashBase64Bytes(photo.payload.bytes)
    if (!targetPhotoSha256) throw new Error('The prepared Pauly profile photo has no bytes.')
    const operationState = await loadOperationState()
    const confirmedPhotoSha256 = normalizeProperty24Text(operationState.profilePicture?.confirmedRemoteSha256)
    const confirmedPhotoSourceSha256 = normalizeProperty24Text(operationState.profilePicture?.sourceSha256)
    const baselinePhotoSha256 = normalizeProperty24Text(operationState.profilePicture?.baselineRemoteSha256) || agents.paulySummary.profilePictureSha256
    const photoAlreadyApplied = Boolean(
      confirmedPhotoSha256 &&
      confirmedPhotoSourceSha256 === targetPhotoSha256 &&
      confirmedPhotoSha256 === agents.paulySummary.profilePictureSha256,
    )
    const { definition: currentSale, state } = await loadSale('sale')
    if (Number(currentSale.property24ListingNumber) !== PHASE3.listingNumber) {
      throw new Error(`Phase 2 sale state is not locked to listing ${PHASE3.listingNumber}.`)
    }
    const reassignedSale = {
      ...currentSale,
      agentId: PHASE3.pauly.agentId,
      agentSourceReference: PHASE3.pauly.sourceReference,
      agentName: `${PHASE3.pauly.firstname} ${PHASE3.pauly.lastname}`,
    }
    const listingPlan = buildSalePlan(
      reassignedSale,
      { media: [], summaries: [] },
      {
        listingNumber: PHASE3.listingNumber,
        photosChanged: false,
        status: currentSale.status,
      },
    )
    if (!listingPlan.canSubmit) {
      throw new Error(`Listing reassignment payload is blocked: ${[...listingPlan.dataBlockers, ...listingPlan.technicalBlockers].join(', ')}.`)
    }

    const jonPhonePayload = buildAgentUpdatePayload(agents.jon, {
      mobileNumber: targetTelephone,
      status: agents.jonSummary.status,
    })
    const jonInactivePayload = buildAgentUpdatePayload(agents.jon, {
      mobileNumber: targetTelephone,
      status: 'Inactive',
    })
    const preflight = {
      agentsHttpStatus: agents.httpStatus,
      jon: agents.jonSummary,
      pauly: agents.paulySummary,
      assignment,
      actions: {
        telephone: {
          agentId: PHASE3.jon.agentId,
          from: agents.jonSummary.mobileNumber,
          to: targetTelephone,
          payload: jonPhonePayload,
        },
        profilePicture: {
          agentId: PHASE3.pauly.agentId,
          source: photo.summary,
          currentSha256: agents.paulySummary.profilePictureSha256,
          targetSha256: targetPhotoSha256,
          baselineRemoteSha256: baselinePhotoSha256,
          alreadyApplied: photoAlreadyApplied,
          endpoint: `/listing/v53/agents/${PHASE3.pauly.agentId}/profile-picture`,
        },
        listingReassignment: {
          listingNumber: PHASE3.listingNumber,
          fromAgentId: PHASE3.jon.agentId,
          toAgentId: PHASE3.pauly.agentId,
          payload: createRedactedProperty24Payload(listingPlan.payload),
        },
        deactivateJon: {
          agentId: PHASE3.jon.agentId,
          dependsOnVerifiedReassignment: true,
          payload: jonInactivePayload,
        },
      },
    }

    if (!apply) {
      return {
        status: 'PHASE3_DRY_RUN_READY',
        environment: 'exdev',
        message: 'All Phase 3 payloads passed validation. Only read-only Property24 checks were made.',
        preflight,
      }
    }

    currentStep = 'update_jon_telephone'
    let latestAgents = agents
    if (agents.jonSummary.mobileNumber === targetTelephone) {
      completed.push({ step: currentStep, status: 'ALREADY_UPDATED', agentId: PHASE3.jon.agentId, mobileNumber: targetTelephone })
    } else {
      const result = await property24.updateAgent(jonPhonePayload)
      latestAgents = await fetchAgents(property24)
      if (latestAgents.jonSummary.mobileNumber !== targetTelephone) {
        throw new Error(`Jon’s telephone was not confirmed as ${targetTelephone}.`)
      }
      assertOnlyExpectedAgentFieldsChanged(agents.jonSummary, latestAgents.jonSummary, ['mobileNumber'])
      const photoPreservation = await preserveAgentProfilePicture(property24, agents.jon, latestAgents, PHASE3.jon)
      latestAgents = photoPreservation.agents
      completed.push({
        step: currentStep,
        status: 'UPDATED',
        agentId: PHASE3.jon.agentId,
        mobileNumber: targetTelephone,
        httpStatus: result.status,
        profilePictureRestored: photoPreservation.restored,
        profilePictureRestoreHttpStatus: photoPreservation.httpStatus,
      })
    }

    currentStep = 'update_pauly_profile_picture'
    let expectedRemotePhotoSha256 = confirmedPhotoSha256
    if (photoAlreadyApplied) {
      expectedRemotePhotoSha256 = latestAgents.paulySummary.profilePictureSha256
      completed.push({ step: currentStep, status: 'ALREADY_UPDATED', agentId: PHASE3.pauly.agentId, sha256: expectedRemotePhotoSha256 })
    } else {
      const paulyBefore = latestAgents.paulySummary
      const result = await property24.updateAgentProfilePicture(PHASE3.pauly.agentId, photo.payload)
      latestAgents = await fetchAgents(property24)
      expectedRemotePhotoSha256 = latestAgents.paulySummary.profilePictureSha256
      if (!expectedRemotePhotoSha256 || expectedRemotePhotoSha256 === baselinePhotoSha256) {
        throw new Error('Pauly’s remote profile picture did not change from the captured pre-Phase-3 hash.')
      }
      assertOnlyExpectedAgentFieldsChanged(paulyBefore, latestAgents.paulySummary)
      await persistOperationState({
        version: 1,
        agencyId: PHASE3.agencyId,
        paulyAgentId: PHASE3.pauly.agentId,
        updatedAt: new Date().toISOString(),
        profilePicture: {
          sourceSha256: targetPhotoSha256,
          baselineRemoteSha256: baselinePhotoSha256,
          confirmedRemoteSha256: expectedRemotePhotoSha256,
        },
      })
      completed.push({
        step: currentStep,
        status: 'UPDATED',
        agentId: PHASE3.pauly.agentId,
        sourceSha256: targetPhotoSha256,
        confirmedRemoteSha256: expectedRemotePhotoSha256,
        httpStatus: result.status,
      })
    }

    currentStep = 'reassign_jon_listing_to_pauly'
    if (assignment.paulyHasListing && !assignment.jonHasListing) {
      completed.push({ step: currentStep, status: 'ALREADY_REASSIGNED', listingNumber: PHASE3.listingNumber, agentId: PHASE3.pauly.agentId })
    } else {
      const result = await property24.saveListing(listingPlan.payload)
      const returnedListingNumber = extractListingNumber(result.data)
      if (returnedListingNumber && returnedListingNumber !== PHASE3.listingNumber) {
        throw new Error(`Property24 returned listing ${returnedListingNumber}; expected ${PHASE3.listingNumber}.`)
      }
      completed.push({
        step: currentStep,
        status: 'REASSIGNMENT_ACCEPTED',
        listingNumber: PHASE3.listingNumber,
        agentId: PHASE3.pauly.agentId,
        httpStatus: result.status,
      })
    }
    await persistSale({ definition: reassignedSale, state, status: listingPlan.summary.status })

    currentStep = 'verify_listing_reassignment'
    const verifiedAssignment = await verifyAssignment(property24, { wait })
    if (!verifiedAssignment.verified) {
      throw new Error('Listing reassignment was not confirmed under Pauly with Jon cleared and the listing still on the portal. Jon was not deactivated.')
    }
    completed.push({ step: currentStep, status: 'VERIFIED', listingNumber: PHASE3.listingNumber, assignment: verifiedAssignment })

    currentStep = 'deactivate_jon'
    latestAgents = await fetchAgents(property24)
    const jonStatus = normalizeProperty24Text(latestAgents.jonSummary.status).toLowerCase()
    if (jonStatus === 'inactive') {
      completed.push({ step: currentStep, status: 'ALREADY_INACTIVE', agentId: PHASE3.jon.agentId })
    } else {
      if (jonStatus !== 'active') throw new Error(`Jon has unexpected status "${latestAgents.jonSummary.status}".`)
      const beforeInactive = latestAgents.jonSummary
      const beforeInactiveAgent = latestAgents.jon
      const inactivePayload = buildAgentUpdatePayload(latestAgents.jon, {
        mobileNumber: targetTelephone,
        status: 'Inactive',
      })
      const result = await property24.updateAgent(inactivePayload)
      latestAgents = await fetchAgents(property24)
      if (normalizeProperty24Text(latestAgents.jonSummary.status).toLowerCase() !== 'inactive') {
        throw new Error('Jon was not confirmed as inactive after the agent update.')
      }
      if (latestAgents.jonSummary.mobileNumber !== targetTelephone) {
        throw new Error('Jon’s updated telephone was not preserved during deactivation.')
      }
      assertOnlyExpectedAgentFieldsChanged(beforeInactive, latestAgents.jonSummary, ['status'])
      const photoPreservation = await preserveAgentProfilePicture(property24, beforeInactiveAgent, latestAgents, PHASE3.jon)
      if (!photoPreservation.agents.jonSummary.profilePictureSha256 && beforeInactive.profilePictureSha256) {
        throw new Error('Jon’s profile picture was not preserved during deactivation.')
      }
      latestAgents = photoPreservation.agents
      completed.push({
        step: currentStep,
        status: 'INACTIVE',
        agentId: PHASE3.jon.agentId,
        httpStatus: result.status,
        profilePictureRestored: photoPreservation.restored,
        profilePictureRestoreHttpStatus: photoPreservation.httpStatus,
      })
    }

    currentStep = 'final_verification'
    const [finalAgents, finalAssignment] = await Promise.all([
      fetchAgents(property24),
      fetchAssignment(property24),
    ])
    if (
      finalAgents.jonSummary.mobileNumber !== targetTelephone ||
      normalizeProperty24Text(finalAgents.jonSummary.status).toLowerCase() !== 'inactive' ||
      finalAgents.paulySummary.profilePictureSha256 !== expectedRemotePhotoSha256 ||
      finalAssignment.jonHasListing ||
      !finalAssignment.paulyHasListing ||
      !finalAssignment.isOnPortal
    ) {
      throw new Error('Final Phase 3 verification did not match the requested end state.')
    }
    completed.push({ step: currentStep, status: 'VERIFIED' })

    return {
      status: 'PHASE3_COMPLETE',
      environment: 'exdev',
      agencyId: PHASE3.agencyId,
      completed,
      final: {
        jon: finalAgents.jonSummary,
        pauly: finalAgents.paulySummary,
        assignment: finalAssignment,
      },
    }
  } catch (error) {
    return {
      status: completed.length ? 'PHASE3_PARTIAL_FAILURE' : 'PHASE3_BLOCKED',
      environment: 'exdev',
      completed,
      error: buildError(error, currentStep),
      safety: currentStep === 'deactivate_jon' || currentStep === 'final_verification'
        ? 'Listing reassignment had already been verified before the deactivation step.'
        : 'Jon was not deactivated because listing reassignment had not yet been verified.',
    }
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  if (config.missing.length) {
    console.log(JSON.stringify({ status: 'BLOCKED', missingConfiguration: config.missing }, null, 2))
    process.exitCode = 1
    return
  }
  if (config.baseUrl.replace(/\/+$/g, '') !== PROPERTY24_EXDEV_BASE_URL) {
    throw new Error(`Phase 3 vetting runner is locked to Property24 ExDev; received ${config.baseUrl}`)
  }
  if (!options.photo) throw new Error('--photo requires a file path.')

  const photo = await prepareProperty24AgentPhotoFile(path.resolve(appRoot, options.photo))
  const property24 = createProperty24Client(config)
  const report = await executePhase3Workflow({ property24, photo, apply: options.apply })
  console.log(JSON.stringify(report, null, 2))
  if (['PHASE3_BLOCKED', 'PHASE3_PARTIAL_FAILURE'].includes(report.status)) process.exitCode = 1
}

if (path.resolve(process.argv[1] || '') === scriptPath) {
  run().catch((error) => {
    console.error(JSON.stringify({
      status: 'FAILED',
      name: error.name || 'Error',
      message: error.message,
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }, null, 2))
    process.exitCode = 1
  })
}
