import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  extractPrivatePropertyXmlTag,
  normalizePrivatePropertyText,
} from '../server/services/privatePropertyClient.js'
import {
  buildPrivatePropertyCliConfig,
  createPrivatePropertyCliClient,
  parsePrivatePropertyActiveListings,
  parsePrivatePropertyListingEvents,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

// These IDs and references are the accepted first Private Property sandbox series.
// Phase 2 mutates only these records, so this snapshot is the before-state evidence.
const ACCEPTED_LISTINGS = [
  { row: 2, propertyId: 'PP-SANDBOX-RENTAL-RES-001', listingType: 'Rental', expectedReference: 'rr2755973' },
  { row: 3, propertyId: 'PP-SANDBOX-RENTAL-COM-M2-001', listingType: 'Rental', expectedReference: 'rr2755974' },
  { row: 4, propertyId: 'PP-SANDBOX-RENTAL-COM-DAY-001', listingType: 'Rental', expectedReference: 'rr2755975' },
  { row: 5, propertyId: 'PP-SANDBOX-SALE-RES-VIDEO-001', listingType: 'Sale', expectedReference: 'T2870290' },
  { row: 6, propertyId: 'PP-SANDBOX-SALE-COM-SHOWDAY-001', listingType: 'Sale', expectedReference: 'T2870291' },
  { row: 7, propertyId: 'PP-SANDBOX-SALE-FARM-AUCTION-001', listingType: 'Sale', expectedReference: 'T2870292' },
  { row: 8, propertyId: 'PP-SANDBOX-SALE-LAND-001', listingType: 'Sale', expectedReference: 'T2870293' },
]

const ACCEPTED_AGENTS = [
  { agentId: 'ARCH9-SANDBOX-USER-1', label: 'Sandbox User 1', expectedActive: true },
  { agentId: 'ARCH9-SANDBOX-USER-2', label: 'Sandbox User 2', expectedActive: true },
]

function parseArgs(argv = []) {
  const options = {
    capture: false,
    continuationKey: '0',
    startDateTime: '',
    output: path.join(appRoot, 'outputs', 'private-property-sandbox-baseline.json'),
  }
  for (const arg of argv) {
    if (arg === '--capture') {
      options.capture = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = normalizePrivatePropertyText(match[2])
  }
  return options
}

function sanitizeError(error = {}) {
  return {
    name: error.name || 'Error',
    message: normalizePrivatePropertyText(error.message),
    method: normalizePrivatePropertyText(error.method),
    status: error.status || null,
    statusText: normalizePrivatePropertyText(error.statusText),
    faultCode: normalizePrivatePropertyText(error.faultCode),
    faultString: normalizePrivatePropertyText(error.faultString),
  }
}

function responseMeta(response = {}) {
  return {
    ok: Boolean(response.ok),
    status: response.status || null,
    statusText: normalizePrivatePropertyText(response.statusText),
    durationMs: Number(response.durationMs) || null,
  }
}

async function settleRead(name, request) {
  try {
    const response = await request()
    return { name, status: 'CAPTURED', response, meta: responseMeta(response) }
  } catch (error) {
    return { name, status: 'FAILED', error: sanitizeError(error) }
  }
}

function findMatchingEvent(events = [], propertyId = '') {
  const normalizedPropertyId = normalizePrivatePropertyText(propertyId)
  return events.filter((event) => (
    normalizePrivatePropertyText(event.propertyId) === normalizedPropertyId ||
    normalizePrivatePropertyText(event.eventDescription).includes(normalizedPropertyId)
  ))
}

function summarizeListing({ listing, reads, activeListings, events }) {
  const byName = Object.fromEntries(reads.map((read) => [read.name, read]))
  const status = byName.status?.response
  const verbose = byName.verbose?.response
  const reference = byName.reference?.response
  const details = byName.details?.response
  const activeListing = activeListings.find((item) => item.uniqueId === listing.propertyId) || null
  const matchingEvents = findMatchingEvent(events, listing.propertyId)
  const privatePropertyRef = normalizePrivatePropertyText(
    reference?.data ? extractPrivatePropertyXmlTag(reference.data, 'GetReferenceNumberByListingResult') : '',
  ) || activeListing?.privatePropertyRef || matchingEvents[0]?.privatePropertyRef || ''
  const failures = reads.filter((read) => read.status === 'FAILED')

  return {
    ...listing,
    captureStatus: failures.length ? 'ATTENTION_REQUIRED' : 'CAPTURED',
    privatePropertyStatus: status?.data ? extractPrivatePropertyXmlTag(status.data, 'GetListingStatusResult') : '',
    privatePropertyStatusVerbose: verbose?.data ? extractPrivatePropertyXmlTag(verbose.data, 'GetListingStatusVerboseResult') : '',
    privatePropertyReference: privatePropertyRef,
    expectedReferenceMatches: Boolean(privatePropertyRef) && privatePropertyRef.toLowerCase() === listing.expectedReference.toLowerCase(),
    activeListing,
    listingDetailsAvailable: Boolean(details?.data && extractPrivatePropertyXmlTag(details.data, 'GetListingsDetailsResult')),
    eventCount: matchingEvents.length,
    latestEvent: matchingEvents[0] || null,
    reads: reads.map((read) => ({
      name: read.name,
      status: read.status,
      ...(read.meta ? { response: read.meta } : {}),
      ...(read.error ? { error: read.error } : {}),
    })),
  }
}

function createDryRunReport(config, options) {
  return {
    phase: 'private-property-sandbox-phase1-baseline',
    generatedAt: new Date().toISOString(),
    environment: config.environment,
    status: 'DRY_RUN',
    capture: false,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingOrAgentChanged: false,
      rawCredentialsStored: false,
      rawSoapStored: false,
    },
    baseline: {
      listings: ACCEPTED_LISTINGS,
      agents: ACCEPTED_AGENTS.map((agent) => ({
        ...agent,
        verification: 'Private Property provides no agent-profile read endpoint; preserve the initial-series agent ID and update evidence.',
      })),
    },
    plannedReadCalls: [
      'GetActiveListings',
      'GetListingEventFeedByBranch',
      'GetListingStatus',
      'GetListingStatusVerbose',
      'GetReferenceNumberByListing',
      'GetListingsDetails',
    ],
    nextStep: 'Run with --capture while the Private Property sandbox is available to write the before-state evidence snapshot.',
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildPrivatePropertyCliConfig(options)
  if (!options.capture) {
    const report = createDryRunReport(config, options)
    const output = writePrivatePropertyReport(report, options.output, 'private-property-sandbox-baseline.json')
    console.log(JSON.stringify({ status: report.status, output, nextStep: report.nextStep }, null, 2))
    return
  }

  const missing = [...config.missing]
  if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (missing.length) {
    const report = {
      ...createDryRunReport(config, options),
      status: 'BLOCKED',
      capture: true,
      missingConfiguration: missing,
      nextStep: 'Configure the sandbox credentials and branch GUID, then re-run with --capture.',
    }
    const output = writePrivatePropertyReport(report, options.output, 'private-property-sandbox-baseline.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createPrivatePropertyCliClient(config)
  const [activeRead, eventRead] = await Promise.all([
    settleRead('active_listings', () => client.getActiveListings({ branchGuid: config.branchGuid })),
    settleRead('event_feed', () => client.getListingEventFeedByBranch({
      branchGuid: config.branchGuid,
      continuationKey: options.continuationKey,
      startDateTime: options.startDateTime,
    })),
  ])
  const activeListings = activeRead.response ? parsePrivatePropertyActiveListings(activeRead.response.data) : []
  const events = eventRead.response ? parsePrivatePropertyListingEvents(eventRead.response.data) : []
  const listings = await Promise.all(ACCEPTED_LISTINGS.map(async (listing) => {
    const reads = await Promise.all([
      settleRead('status', () => client.getListingStatus({ branchGuid: config.branchGuid, propertyId: listing.propertyId })),
      settleRead('verbose_status', () => client.getListingStatusVerbose({ branchGuid: config.branchGuid, propertyId: listing.propertyId })),
      settleRead('reference', () => client.getReferenceNumberByListing({
        branchGuid: config.branchGuid,
        uniqueListingId: listing.propertyId,
        listingType: listing.listingType,
      })),
      settleRead('details', () => client.getListingsDetails({ branchGuid: config.branchGuid, uniqueListingId: listing.propertyId })),
    ])
    return summarizeListing({ listing, reads, activeListings, events })
  }))
  const readFailures = [activeRead, eventRead, ...listings.flatMap((listing) => listing.reads)]
    .filter((read) => read.status === 'FAILED')
  const referenceMismatches = listings.filter((listing) => !listing.expectedReferenceMatches)
  const report = {
    phase: 'private-property-sandbox-phase1-baseline',
    generatedAt: new Date().toISOString(),
    environment: config.environment,
    status: readFailures.length || referenceMismatches.length ? 'ATTENTION_REQUIRED' : 'CAPTURED',
    capture: true,
    safety: {
      privatePropertyApiCalled: true,
      databaseWritten: false,
      listingOrAgentChanged: false,
      rawCredentialsStored: false,
      rawSoapStored: false,
    },
    branchGuid: config.branchGuid,
    baseline: {
      listings,
      agents: ACCEPTED_AGENTS.map((agent) => ({
        ...agent,
        verification: 'Private Property provides no agent-profile read endpoint; preserve the initial-series agent ID and update evidence.',
      })),
      activeListingsRead: activeRead.response ? responseMeta(activeRead.response) : activeRead.error,
      eventFeedRead: eventRead.response
        ? {
          ...responseMeta(eventRead.response),
          continuationKey: extractPrivatePropertyXmlTag(eventRead.response.data, 'ContinuationKey'),
          eventCount: events.length,
        }
        : eventRead.error,
    },
    blockers: [
      ...readFailures.map((read) => `sandbox_read_failed:${read.name}`),
      ...referenceMismatches.map((listing) => `reference_mismatch:${listing.propertyId}`),
    ],
    nextStep: readFailures.length || referenceMismatches.length
      ? 'Resolve baseline mismatches before running any green follow-up action.'
      : 'Baseline frozen. Phase 2 can safely run one green follow-up action at a time against these records.',
  }
  const output = writePrivatePropertyReport(report, options.output, 'private-property-sandbox-baseline.json')
  console.log(JSON.stringify({
    status: report.status,
    output,
    listingCount: listings.length,
    blockers: report.blockers,
    nextStep: report.nextStep,
  }, null, 2))
  if (report.status !== 'CAPTURED') process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
  }, null, 2))
  process.exitCode = 1
})
