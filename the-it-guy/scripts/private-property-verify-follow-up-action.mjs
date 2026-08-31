import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  extractPrivatePropertyXmlBlocks,
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
const DEFAULT_BASELINE_PATH = path.join(appRoot, 'outputs', 'private-property-sandbox-baseline.json')

const ACTIONS = [
  { id: 'rental-residential-per-week-hide-address', propertyId: 'PP-SANDBOX-RENTAL-RES-001', listingType: 'Rental', expectedReference: 'rr2755973', expected: { rentalPriceType: 'PerWeek', hiddenAddress: true } },
  { id: 'rental-commercial-add-agent-images', propertyId: 'PP-SANDBOX-RENTAL-COM-M2-001', listingType: 'Rental', expectedReference: 'rr2755974', expected: { agentIds: ['ARCH9-SANDBOX-USER-1', 'ARCH9-SANDBOX-USER-2'], minPhotoUrls: 5 } },
  { id: 'agent-user-2-inactive', agentId: 'ARCH9-SANDBOX-USER-2', expected: { active: false } },
  { id: 'rental-commercial-to-residential', propertyId: 'PP-SANDBOX-RENTAL-COM-DAY-001', listingType: 'Rental', expectedReference: 'rr2755975', expected: { category: 'Residential', bedrooms: '2', bathrooms: '1' } },
  { id: 'sale-residential-change-unique-id', propertyId: 'PP-SANDBOX-SALE-RES-VIDEO-001', listingType: 'Sale', expectedReference: 'T2870290', requiresNewPropertyId: true },
  { id: 'sale-commercial-cancel-showday-reduce-price', propertyId: 'PP-SANDBOX-SALE-COM-SHOWDAY-001', listingType: 'Sale', expectedReference: 'T2870291', expected: { price: '3840000' } },
  { id: 'sale-farm-reorder-agents', propertyId: 'PP-SANDBOX-SALE-FARM-AUCTION-001', listingType: 'Sale', expectedReference: 'T2870292', expected: { agentIds: ['ARCH9-SANDBOX-USER-2', 'ARCH9-SANDBOX-USER-1'] } },
  { id: 'sale-land-offers-from', propertyId: 'PP-SANDBOX-SALE-LAND-001', listingType: 'Sale', expectedReference: 'T2870293', requiresOffersFrom: true, expected: { salesPricePresentation: 'OffersFrom' } },
]

function parseArgs(argv = []) {
  const options = {
    action: '',
    verify: false,
    baseline: DEFAULT_BASELINE_PATH,
    newPropertyId: '',
    offersFrom: '',
    continuationKey: '0',
    startDateTime: '',
    agentEvidence: path.join(appRoot, 'outputs', 'private-property-sandbox-user-2-inactive.json'),
    output: '',
  }
  for (const arg of argv) {
    if (arg === '--verify') {
      options.verify = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = normalizePrivatePropertyText(match[2])
  }
  return options
}

function selectAction(actionId = '') {
  const action = ACTIONS.find((candidate) => candidate.id === actionId)
  if (!action) throw new Error(`--action must be one of: ${ACTIONS.map((item) => item.id).join(', ')}`)
  return action
}

function normalizeXmlText(value = '') {
  return normalizePrivatePropertyText(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function responseMeta(response = {}) {
  return { ok: Boolean(response.ok), status: response.status || null, durationMs: Number(response.durationMs) || null }
}

function readBaseline(filePath, action) {
  if (!fs.existsSync(filePath)) return { ready: false, blocker: 'baseline_missing:run_private_property_capture_sandbox_baseline_first' }
  try {
    const baseline = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (action.agentId) {
      const agent = Array.isArray(baseline?.baseline?.agents) ? baseline.baseline.agents.find((item) => item.agentId === action.agentId) : null
      return { ready: baseline?.phase === 'private-property-sandbox-phase1-baseline' && baseline?.status === 'CAPTURED' && Boolean(agent), blocker: agent ? '' : 'baseline_agent_id_mismatch' }
    }
    const listing = Array.isArray(baseline?.baseline?.listings) ? baseline.baseline.listings.find((item) => item.propertyId === action.propertyId) : null
    const referenceMatches = normalizePrivatePropertyText(listing?.privatePropertyReference).toLowerCase() === action.expectedReference.toLowerCase()
    return {
      ready: baseline?.phase === 'private-property-sandbox-phase1-baseline' && baseline?.status === 'CAPTURED' && listing?.captureStatus === 'CAPTURED' && referenceMatches,
      blocker: referenceMatches ? 'baseline_not_captured' : 'baseline_target_or_reference_mismatch',
    }
  } catch (error) {
    return { ready: false, blocker: `baseline_unreadable:${error.message}` }
  }
}

function attributeMap(xml = '') {
  return Object.fromEntries(extractPrivatePropertyXmlBlocks(xml, 'Attribute').map((block) => [
    normalizeXmlText(extractPrivatePropertyXmlTag(block, 'AttributeType')),
    normalizeXmlText(extractPrivatePropertyXmlTag(block, 'Value')),
  ]).filter(([key]) => key))
}

function detailSummary(xml = '') {
  const photoBlock = extractPrivatePropertyXmlTag(xml, 'PhotoUrls')
  const agentIds = normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'AgentId')).split(',').map(normalizePrivatePropertyText).filter(Boolean)
  return {
    available: Boolean(normalizePrivatePropertyText(xml)),
    category: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'Category')),
    price: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'Price')),
    rentalPriceType: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'RentalPriceType')),
    salesPricePresentation: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'SalesPricePresentation')),
    offersFrom: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'OffersFrom')),
    agentIds,
    photoUrlCount: extractPrivatePropertyXmlBlocks(photoBlock, 'string').length,
    hiddenAddress: {
      streetName: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'HideStreetName')),
      streetNo: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'HideStreetNo')),
      complexName: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'HideComplexName')),
      unitNo: normalizeXmlText(extractPrivatePropertyXmlTag(xml, 'HideUnitNumber')),
    },
    attributes: attributeMap(xml),
  }
}

function checkDetail(name, available, actual, expected) {
  if (!available || actual === '' || actual === null || actual === undefined) return { name, status: 'PENDING_MANUAL_CHECK', expected, actual: actual ?? null }
  return { name, status: String(actual).toLowerCase() === String(expected).toLowerCase() ? 'PASS' : 'ATTENTION_REQUIRED', expected, actual }
}

function buildDetailChecks(action, details) {
  const expected = action.expected || {}
  const checks = []
  if (expected.rentalPriceType) checks.push(checkDetail('rental_price_type', details.available, details.rentalPriceType, expected.rentalPriceType))
  if (expected.category) checks.push(checkDetail('category', details.available, details.category, expected.category))
  if (expected.price) checks.push(checkDetail('price', details.available, details.price, expected.price))
  if (expected.salesPricePresentation) checks.push(checkDetail('sales_price_presentation', details.available, details.salesPricePresentation, expected.salesPricePresentation))
  if (expected.offersFrom) checks.push(checkDetail('offers_from', details.available, details.offersFrom, expected.offersFrom))
  if (expected.bedrooms) checks.push(checkDetail('bedrooms', details.available, details.attributes.Bedrooms, expected.bedrooms))
  if (expected.bathrooms) checks.push(checkDetail('bathrooms', details.available, details.attributes.Bathrooms, expected.bathrooms))
  if (expected.agentIds) checks.push(checkDetail('agent_order', details.available, details.agentIds.join(','), expected.agentIds.join(',')))
  if (expected.minPhotoUrls) {
    checks.push({ name: 'photo_url_count', status: !details.available || !details.photoUrlCount ? 'PENDING_MANUAL_CHECK' : details.photoUrlCount >= expected.minPhotoUrls ? 'PASS' : 'ATTENTION_REQUIRED', expected: `at least ${expected.minPhotoUrls}`, actual: details.photoUrlCount })
  }
  if (expected.hiddenAddress) {
    for (const [name, value] of Object.entries(details.hiddenAddress)) checks.push(checkDetail(`hide_address_${name}`, details.available, value, 'true'))
  }
  return checks
}

function verifyAgentEvidence(options, action) {
  if (!fs.existsSync(options.agentEvidence)) return { status: 'PENDING_MANUAL_CHECK', checks: [{ name: 'agent_update_evidence', status: 'PENDING_MANUAL_CHECK', expected: 'completed Phase 3 evidence', actual: 'missing' }] }
  try {
    const evidence = JSON.parse(fs.readFileSync(options.agentEvidence, 'utf8'))
    const pass = evidence?.status === 'COMPLETED' && evidence?.actionId === action.id && evidence?.agent?.agentId === action.agentId
    return { status: pass ? 'VERIFIED' : 'ATTENTION_REQUIRED', checks: [{ name: 'agent_update_evidence', status: pass ? 'PASS' : 'ATTENTION_REQUIRED', expected: 'completed inactive agent evidence', actual: evidence?.status || '' }] }
  } catch (error) {
    return { status: 'ATTENTION_REQUIRED', checks: [{ name: 'agent_update_evidence', status: 'ATTENTION_REQUIRED', expected: 'readable evidence file', actual: error.message }] }
  }
}

async function verifyListing(client, config, options, action, propertyId) {
  const [status, verbose, reference, active, eventFeed, details] = await Promise.all([
    client.getListingStatus({ branchGuid: config.branchGuid, propertyId }),
    client.getListingStatusVerbose({ branchGuid: config.branchGuid, propertyId }),
    client.getReferenceNumberByListing({ branchGuid: config.branchGuid, uniqueListingId: propertyId, listingType: action.listingType }),
    client.getActiveListings({ branchGuid: config.branchGuid }),
    client.getListingEventFeedByBranch({ branchGuid: config.branchGuid, continuationKey: options.continuationKey, startDateTime: options.startDateTime }),
    client.getListingsDetails({ branchGuid: config.branchGuid, uniqueListingId: propertyId }),
  ])
  const activeMatch = parsePrivatePropertyActiveListings(active.data).find((item) => item.uniqueId === propertyId) || null
  const events = parsePrivatePropertyListingEvents(eventFeed.data).filter((item) => item.propertyId === propertyId || item.eventDescription.includes(propertyId))
  const actualReference = normalizePrivatePropertyText(extractPrivatePropertyXmlTag(reference.data, 'GetReferenceNumberByListingResult')) || activeMatch?.privatePropertyRef || events[0]?.privatePropertyRef || ''
  const detailsSummary = detailSummary(details.data)
  const coreChecks = [
    { name: 'private_property_reference', status: actualReference.toLowerCase() === action.expectedReference.toLowerCase() ? 'PASS' : 'ATTENTION_REQUIRED', expected: action.expectedReference, actual: actualReference || null },
    { name: 'active_listing', status: activeMatch ? 'PASS' : 'PENDING_MANUAL_CHECK', expected: propertyId, actual: activeMatch?.uniqueId || null },
    { name: 'listing_status', status: normalizePrivatePropertyText(extractPrivatePropertyXmlTag(status.data, 'GetListingStatusResult')) ? 'PASS' : 'PENDING_MANUAL_CHECK' },
    { name: 'event_feed', status: events.length ? 'PASS' : 'PENDING_MANUAL_CHECK', actual: events.length },
  ]
  const detailChecks = buildDetailChecks(action, detailsSummary)
  const checks = [...coreChecks, ...detailChecks]
  const hasAttention = checks.some((check) => check.status === 'ATTENTION_REQUIRED')
  const hasPending = checks.some((check) => check.status === 'PENDING_MANUAL_CHECK')
  return {
    status: hasAttention ? 'ATTENTION_REQUIRED' : hasPending ? 'PENDING_MANUAL_CHECK' : 'VERIFIED',
    targetPropertyId: propertyId,
    checks,
    observed: {
      privatePropertyStatus: normalizePrivatePropertyText(extractPrivatePropertyXmlTag(status.data, 'GetListingStatusResult')),
      privatePropertyStatusVerbose: normalizePrivatePropertyText(extractPrivatePropertyXmlTag(verbose.data, 'GetListingStatusVerboseResult')),
      privatePropertyReference: actualReference,
      activeListing: activeMatch,
      eventCount: events.length,
      continuationKey: normalizePrivatePropertyText(extractPrivatePropertyXmlTag(eventFeed.data, 'ContinuationKey')),
      details: detailsSummary,
      readResponses: { status: responseMeta(status), verbose: responseMeta(verbose), reference: responseMeta(reference), active: responseMeta(active), eventFeed: responseMeta(eventFeed), details: responseMeta(details) },
    },
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const action = selectAction(options.action)
  options.output = options.output || path.join(appRoot, 'outputs', `private-property-verify-${action.id}.json`)
  const config = buildPrivatePropertyCliConfig(options)
  const baseline = readBaseline(options.baseline, action)
  const targetPropertyId = action.requiresNewPropertyId ? options.newPropertyId : action.propertyId
  const expected = {
    ...(action.expected || {}),
    ...(action.requiresOffersFrom && options.offersFrom ? { offersFrom: options.offersFrom } : {}),
  }
  const actionWithExpected = { ...action, expected }
  const blockers = [
    ...(baseline.ready ? [] : [baseline.blocker]),
    ...(action.requiresNewPropertyId && !targetPropertyId ? ['missing_argument:--new-property-id'] : []),
    ...(action.requiresOffersFrom && !options.offersFrom ? ['missing_argument:--offers-from'] : []),
  ]
  const report = {
    phase: 'private-property-sandbox-phase6-follow-up-verification',
    generatedAt: new Date().toISOString(),
    actionId: action.id,
    status: options.verify ? 'BLOCKED' : 'DRY_RUN',
    verify: options.verify,
    targetPropertyId: targetPropertyId || null,
    baseline: { path: options.baseline, ...baseline },
    safety: { privatePropertyApiCalled: false, databaseWritten: false, listingOrAgentChanged: false, rawCredentialsStored: false, rawSoapStored: false },
    blockers,
    verification: null,
    nextStep: '',
  }
  if (!options.verify) {
    report.nextStep = blockers.length ? 'Resolve the listed blocker before running the read-only verification.' : 'Re-run with --verify while the Private Property sandbox is available.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-follow-up-verification.json')
    console.log(JSON.stringify({ status: report.status, output, blockers, nextStep: report.nextStep }, null, 2))
    return
  }
  if (blockers.length) {
    report.nextStep = 'Resolve the baseline or action input blocker before verification.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-follow-up-verification.json')
    console.log(JSON.stringify({ status: report.status, output, blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  if (action.agentId) {
    report.verification = verifyAgentEvidence(options, action)
    report.status = report.verification.status
    report.nextStep = report.status === 'VERIFIED' ? 'Agent evidence is complete; record the agent ID and result in the Private Property workbook.' : 'Private Property has no agent-profile read endpoint. Review or provide the Phase 3 action evidence.'
  } else {
    const missing = [...config.missing]
    if (!config.branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
    if (missing.length) {
      report.blockers.push(...missing.map((item) => `missing_configuration:${item}`))
      report.nextStep = 'Configure the sandbox credentials and branch GUID, then rerun with --verify.'
      const output = writePrivatePropertyReport(report, options.output, 'private-property-follow-up-verification.json')
      console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
      process.exitCode = 1
      return
    }
    report.safety.privatePropertyApiCalled = true
    try {
      report.verification = await verifyListing(createPrivatePropertyCliClient(config), config, options, actionWithExpected, targetPropertyId)
      report.status = report.verification.status
      report.nextStep = report.status === 'VERIFIED' ? 'Verification complete. Record the confirmed reference and result in the Private Property workbook.' : report.status === 'PENDING_MANUAL_CHECK' ? 'Listing identity is intact, but complete the named portal checks before marking this action done.' : 'Do not run another mutation. Investigate the mismatched reference or field before continuing.'
    } catch (error) {
      report.status = 'ATTENTION_REQUIRED'
      report.blockers.push('private_property_follow_up_verification_failed')
      report.verification = { error: { name: error.name || 'Error', message: error.message, status: error.status || null, faultCode: error.faultCode || '', faultString: error.faultString || '' } }
      report.nextStep = 'Check the sandbox connection and API response, then rerun this read-only verification.'
    }
  }
  const output = writePrivatePropertyReport(report, options.output, 'private-property-follow-up-verification.json')
  console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
  if (report.status === 'ATTENTION_REQUIRED') process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
