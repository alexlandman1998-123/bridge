import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_BASELINE_PATH = path.join(appRoot, 'outputs', 'private-property-sandbox-baseline.json')

const RENTAL_ACTIONS = [
  {
    id: 'rental-residential-per-week-hide-address',
    row: 2,
    listingId: 'c104af94-d907-4161-aa15-f1c61e6ec118',
    propertyId: 'PP-SANDBOX-RENTAL-RES-001',
    expectedReference: 'rr2755973',
    commandArgs: [
      '--rental-price-type=PerWeek',
      '--hide-street-name=true',
      '--hide-street-no=true',
      '--hide-complex-name=true',
      '--hide-unit-no=true',
    ],
  },
  {
    id: 'rental-commercial-add-agent-images',
    row: 3,
    listingId: '831742a2-a732-49cb-9af6-c73cb96677e6',
    propertyId: 'PP-SANDBOX-RENTAL-COM-M2-001',
    expectedReference: 'rr2755974',
    commandArgs: [
      '--rental-price-type=PerM2',
      '--agent-ids=ARCH9-SANDBOX-USER-1,ARCH9-SANDBOX-USER-2',
      '--additional-photo-urls=https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1600&q=80,https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
    ],
    executionNote: 'Run this before Phase 3 deactivates Sandbox User 2.',
  },
  {
    id: 'rental-commercial-to-residential',
    row: 4,
    listingId: '009d70a1-7c5d-4d44-a08e-0e1eb33e4961',
    propertyId: 'PP-SANDBOX-RENTAL-COM-DAY-001',
    expectedReference: 'rr2755975',
    commandArgs: [
      '--category=Residential',
      '--property-type=Apartment',
      '--bedrooms=2',
      '--bathrooms=1',
      '--rental-price-type=PerDay',
    ],
  },
]

function parseArgs(argv = []) {
  const options = {
    action: 'all',
    baseline: DEFAULT_BASELINE_PATH,
    output: path.join(appRoot, 'outputs', 'private-property-rental-follow-up.json'),
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

function chooseActions(selector = 'all') {
  if (selector === 'all') return RENTAL_ACTIONS
  const action = RENTAL_ACTIONS.find((candidate) => candidate.id === selector)
  if (!action) throw new Error(`Unknown rental follow-up action: ${selector}`)
  return [action]
}

function readBaseline(filePath, actions) {
  if (!fs.existsSync(filePath)) {
    return { ready: false, blocker: 'baseline_missing:run_private_property_capture_sandbox_baseline_first', checks: [] }
  }
  try {
    const baseline = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const listings = Array.isArray(baseline?.baseline?.listings) ? baseline.baseline.listings : []
    const checks = actions.map((action) => {
      const listing = listings.find((item) => item.propertyId === action.propertyId)
      const expectedReferenceMatches = normalizePrivatePropertyText(listing?.privatePropertyReference).toLowerCase() === action.expectedReference.toLowerCase()
      return {
        actionId: action.id,
        propertyId: action.propertyId,
        status: listing?.captureStatus === 'CAPTURED' && expectedReferenceMatches ? 'PASS' : 'BLOCKED',
      }
    })
    const ready = baseline?.phase === 'private-property-sandbox-phase1-baseline' &&
      baseline?.status === 'CAPTURED' &&
      checks.every((check) => check.status === 'PASS')
    return {
      ready,
      phase: normalizePrivatePropertyText(baseline?.phase),
      status: normalizePrivatePropertyText(baseline?.status),
      generatedAt: normalizePrivatePropertyText(baseline?.generatedAt),
      checks,
      blocker: ready ? '' : 'baseline_not_captured_or_rental_target_mismatch',
    }
  } catch (error) {
    return { ready: false, blocker: `baseline_unreadable:${error.message}`, checks: [] }
  }
}

function buildPlan(action) {
  return {
    id: action.id,
    row: action.row,
    target: {
      listingId: action.listingId,
      propertyId: action.propertyId,
      expectedReference: action.expectedReference,
    },
    intendedChanges: action.commandArgs.filter((arg) => !arg.startsWith('--')).length ? [] : action.commandArgs,
    executionNote: action.executionNote || 'Run once and monitor the result before proceeding to the next action.',
  }
}

function sanitizeChildReport(report = {}) {
  return {
    status: normalizePrivatePropertyText(report.status),
    listingId: normalizePrivatePropertyText(report.listingId),
    propertyId: normalizePrivatePropertyText(report.submitCandidate?.propertyId),
    listingType: normalizePrivatePropertyText(report.submitCandidate?.listingType),
    category: normalizePrivatePropertyText(report.submitCandidate?.category),
    rentalPriceType: normalizePrivatePropertyText(report.readiness?.preview?.summary?.rentalPriceType || report.submitCandidate?.rentalPriceType),
    listingPublished: Boolean(report.safety?.listingPublished),
    privatePropertyReference: normalizePrivatePropertyText(report.apiResponse?.privatePropertyReference),
    blockers: Array.isArray(report.blockers) ? report.blockers : [],
    nextStep: normalizePrivatePropertyText(report.nextStep),
  }
}

function invokeAction(action, outputPath) {
  const childOutput = path.join(path.dirname(outputPath), `${action.id}-submit.json`)
  const result = spawnSync(process.execPath, [
    path.join(appRoot, 'scripts', 'private-property-controlled-publish-rehearsal.mjs'),
    '--apply',
    `--listing-id=${action.listingId}`,
    '--environment=sandbox',
    `--property-id=${action.propertyId}`,
    '--suburb-id=140',
    ...action.commandArgs,
    `--output=${childOutput}`,
  ], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const childReport = fs.existsSync(childOutput) ? JSON.parse(fs.readFileSync(childOutput, 'utf8')) : null
  return {
    childOutput,
    exitCode: result.status,
    stderr: normalizePrivatePropertyText(result.stderr),
    childReport,
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
  const baseline = readBaseline(options.baseline, actions)
  const report = {
    phase: 'private-property-sandbox-phase4-rental-follow-up',
    generatedAt: new Date().toISOString(),
    status: options.apply ? 'BLOCKED' : 'DRY_RUN',
    apply: options.apply,
    baseline: { path: options.baseline, ...baseline },
    actions: actions.map(buildPlan),
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingOrAgentChanged: false,
      rawCredentialsStored: false,
      rawSoapStored: false,
      retryAttempted: false,
    },
    blockers: [
      ...(baseline.ready ? [] : [baseline.blocker]),
      ...(options.apply && actions.length !== 1 ? ['apply_requires_exactly_one_rental_action'] : []),
    ],
    evidence: null,
    nextStep: '',
  }

  if (!options.apply) {
    report.nextStep = baseline.ready
      ? 'Choose one rental action and re-run with --apply during the sandbox window.'
      : 'Capture a clean Phase 1 baseline before submitting any rental mutation.'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    return
  }

  if (report.blockers.length) {
    report.nextStep = 'Resolve the baseline or action-selection blocker before sending a rental update.'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }

  const action = actions[0]
  const result = invokeAction(action, options.output)
  report.safety.privatePropertyApiCalled = true
  report.evidence = {
    childOutput: result.childOutput,
    controlledPublish: sanitizeChildReport(result.childReport),
  }
  if (result.exitCode === 0 && report.evidence.controlledPublish.status === 'SUBMITTED' && report.evidence.controlledPublish.listingPublished) {
    report.status = 'SUBMITTED'
    report.safety.listingOrAgentChanged = true
    report.nextStep = 'Poll the Private Property event feed and capture the updated state before running another green action.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('private_property_rental_update_not_confirmed')
    report.evidence.error = result.stderr || 'Private Property did not return a confirmed UpdateListing submission.'
    report.nextStep = 'Do not retry automatically. Review the saved controlled-publish result before deciding whether another request is safe.'
    process.exitCode = 1
  }
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
