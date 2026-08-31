import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_BASELINE_PATH = path.join(appRoot, 'outputs', 'private-property-sandbox-baseline.json')

// One manifest entry per green Private Property sandbox instruction. Later phases
// register a tested handler against these stable IDs; they never target ad-hoc IDs.
const FOLLOW_UP_ACTIONS = [
  {
    id: 'rental-residential-per-week-hide-address',
    row: 2,
    propertyId: 'PP-SANDBOX-RENTAL-RES-001',
    listingType: 'Rental',
    expectedReference: 'rr2755973',
    kind: 'listing_update',
    requiredCapabilities: ['listing_reimport', 'rental_price_type', 'address_visibility'],
    intendedChanges: ['Set rental price type to PerWeek.', 'Hide the listing address.'],
  },
  {
    id: 'rental-commercial-add-agent-images',
    row: 3,
    propertyId: 'PP-SANDBOX-RENTAL-COM-M2-001',
    listingType: 'Rental',
    expectedReference: 'rr2755974',
    kind: 'listing_update',
    requiredCapabilities: ['listing_reimport', 'agent_assignment', 'listing_images'],
    intendedChanges: ['Add Sandbox User 2 as a second agent.', 'Add additional listing images.'],
  },
  {
    id: 'agent-user-2-inactive',
    row: 3,
    agentId: 'ARCH9-SANDBOX-USER-2',
    kind: 'agent_update',
    requiredCapabilities: ['agent_update'],
    intendedChanges: ['Set Sandbox User 2 to inactive.'],
  },
  {
    id: 'rental-commercial-to-residential',
    row: 4,
    propertyId: 'PP-SANDBOX-RENTAL-COM-DAY-001',
    listingType: 'Rental',
    expectedReference: 'rr2755975',
    kind: 'listing_update',
    requiredCapabilities: ['listing_reimport', 'listing_category'],
    intendedChanges: ['Change the listing category from Commercial to Residential.'],
  },
  {
    id: 'sale-residential-change-unique-id',
    row: 5,
    propertyId: 'PP-SANDBOX-SALE-RES-VIDEO-001',
    listingType: 'Sale',
    expectedReference: 'T2870290',
    kind: 'listing_identity_update',
    requiredCapabilities: ['listing_reimport', 'unique_listing_id', 'reference_verification'],
    intendedChanges: ['Change the Arch9 unique listing ID.', 'Verify whether Private Property retains or replaces the T reference.'],
  },
  {
    id: 'sale-commercial-cancel-showday-reduce-price',
    row: 6,
    propertyId: 'PP-SANDBOX-SALE-COM-SHOWDAY-001',
    listingType: 'Sale',
    expectedReference: 'T2870291',
    kind: 'compound_listing_update',
    requiredCapabilities: ['showday_update', 'listing_reimport', 'price_update'],
    intendedChanges: ['Cancel the show day.', 'Reduce the price by R10,000.'],
  },
  {
    id: 'sale-farm-reorder-agents',
    row: 7,
    propertyId: 'PP-SANDBOX-SALE-FARM-AUCTION-001',
    listingType: 'Sale',
    expectedReference: 'T2870292',
    kind: 'listing_update',
    requiredCapabilities: ['listing_reimport', 'agent_assignment_order'],
    intendedChanges: ['Reverse the order of Sandbox User 1 and Sandbox User 2.'],
  },
  {
    id: 'sale-land-offers-from',
    row: 8,
    propertyId: 'PP-SANDBOX-SALE-LAND-001',
    listingType: 'Sale',
    expectedReference: 'T2870293',
    kind: 'listing_update',
    requiredCapabilities: ['listing_reimport', 'offers_from_price_type'],
    intendedChanges: ['Change the price presentation to Offers From.'],
  },
]

function parseArgs(argv = []) {
  const options = {
    action: 'all',
    baseline: DEFAULT_BASELINE_PATH,
    output: path.join(appRoot, 'outputs', 'private-property-follow-up-action-plan.json'),
    apply: false,
  }
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = normalizePrivatePropertyText(match[2])
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function chooseActions(actionSelector = 'all') {
  const selector = normalizePrivatePropertyText(actionSelector) || 'all'
  if (selector === 'all') return FOLLOW_UP_ACTIONS
  const action = FOLLOW_UP_ACTIONS.find((candidate) => candidate.id === selector)
  if (!action) {
    throw new Error(`Unknown follow-up action: ${selector}. Use --action=all or one of: ${FOLLOW_UP_ACTIONS.map((item) => item.id).join(', ')}`)
  }
  return [action]
}

function summarizeBaseline(baseline = {}, actions = []) {
  const listings = Array.isArray(baseline?.baseline?.listings) ? baseline.baseline.listings : []
  const agents = Array.isArray(baseline?.baseline?.agents) ? baseline.baseline.agents : []
  const checks = actions.map((action) => {
    if (action.propertyId) {
      const listing = listings.find((item) => item.propertyId === action.propertyId)
      const referenceMatches = listing?.privatePropertyReference?.toLowerCase() === action.expectedReference.toLowerCase()
      return {
        actionId: action.id,
        target: action.propertyId,
        status: listing?.captureStatus === 'CAPTURED' && referenceMatches ? 'PASS' : 'BLOCKED',
        reason: listing
          ? referenceMatches
            ? 'Phase 1 captured the expected target and reference.'
            : `Phase 1 reference does not match ${action.expectedReference}.`
          : 'Phase 1 has no captured target for this action.',
      }
    }
    const agent = agents.find((item) => item.agentId === action.agentId)
    return {
      actionId: action.id,
      target: action.agentId,
      status: agent ? 'PASS' : 'BLOCKED',
      reason: agent ? 'Phase 1 preserves the expected agent ID.' : 'Phase 1 has no captured agent ID for this action.',
    }
  })
  return {
    path: null,
    phase: normalizePrivatePropertyText(baseline.phase),
    status: normalizePrivatePropertyText(baseline.status),
    generatedAt: normalizePrivatePropertyText(baseline.generatedAt),
    checks,
    ready: normalizePrivatePropertyText(baseline.phase) === 'private-property-sandbox-phase1-baseline' &&
      normalizePrivatePropertyText(baseline.status) === 'CAPTURED' &&
      checks.every((check) => check.status === 'PASS'),
  }
}

function buildActionPlan(action) {
  return {
    id: action.id,
    row: action.row,
    kind: action.kind,
    target: action.propertyId
      ? { propertyId: action.propertyId, listingType: action.listingType, expectedReference: action.expectedReference }
      : { agentId: action.agentId },
    requiredCapabilities: action.requiredCapabilities,
    intendedChanges: action.intendedChanges,
    executionRules: [
      'Run this action once only; do not retry after an ambiguous Private Property response.',
      'Write the action response as a separate evidence record.',
      'Poll and capture post-action status before moving to the next action.',
    ],
  }
}

function writeReport(report, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  return outputPath
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const actions = chooseActions(options.action)
  let baseline = null
  let baselineSummary = null
  let baselineError = null
  if (fs.existsSync(options.baseline)) {
    try {
      baseline = readJson(options.baseline)
      baselineSummary = summarizeBaseline(baseline, actions)
      baselineSummary.path = options.baseline
    } catch (error) {
      baselineError = error.message
    }
  }

  const baselineReady = Boolean(baselineSummary?.ready)
  const report = {
    phase: 'private-property-sandbox-phase2-follow-up-action-runner',
    generatedAt: new Date().toISOString(),
    status: options.apply ? 'BLOCKED' : 'DRY_RUN',
    apply: options.apply,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingOrAgentChanged: false,
      rawCredentialsStored: false,
      rawSoapStored: false,
    },
    baseline: baselineSummary || {
      path: options.baseline,
      status: 'MISSING',
      ready: false,
      checks: [],
    },
    actions: actions.map(buildActionPlan),
    blockers: [
      ...(baselineError ? [`baseline_unreadable:${baselineError}`] : []),
      ...(!baseline && !baselineError ? ['baseline_missing:run_private_property_capture_sandbox_baseline_first'] : []),
      ...(baseline && !baselineReady ? ['baseline_not_captured_or_target_mismatch'] : []),
      ...(options.apply ? ['follow_up_action_handlers_not_registered'] : []),
    ],
    nextStep: options.apply
      ? baselineReady
        ? 'Phase 2 intentionally refuses writes: register and test the relevant action handler in the next implementation phase before attempting this action.'
        : 'Capture a clean Phase 1 baseline before registering or running a follow-up action handler.'
      : baselineReady
        ? 'Runner plan is ready. Implement and test the selected action handler, then use this manifest as its target and evidence contract.'
        : 'Run the Phase 1 baseline capture during the sandbox window, then re-run this command to validate action targets.',
  }
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    actionCount: report.actions.length,
    baselineReady,
    blockers: report.blockers,
    nextStep: report.nextStep,
  }, null, 2))
  if (options.apply) process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
