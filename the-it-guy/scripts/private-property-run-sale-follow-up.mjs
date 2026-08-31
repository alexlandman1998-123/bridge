import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_BASELINE_PATH = path.join(appRoot, 'outputs', 'private-property-sandbox-baseline.json')

const SALE_ACTIONS = [
  {
    id: 'sale-residential-change-unique-id',
    row: 5,
    listingId: '237730c6-3f64-47c5-baa9-deb7385c59c2',
    propertyId: 'PP-SANDBOX-SALE-RES-VIDEO-001',
    expectedReference: 'T2870290',
    kind: 'listing_identity_update',
    requiresNewPropertyId: true,
  },
  {
    id: 'sale-commercial-cancel-showday-reduce-price',
    row: 6,
    listingId: 'd1104b55-0893-4ac3-b00e-4527b84ebb7a',
    propertyId: 'PP-SANDBOX-SALE-COM-SHOWDAY-001',
    expectedReference: 'T2870291',
    kind: 'compound_listing_update',
    showday: {
      startDate: '2026-08-29T10:00:00',
      endDate: '2026-08-29T12:00:00',
      description: 'Arch9 sandbox show day',
    },
    reducedPrice: '3840000',
  },
  {
    id: 'sale-farm-reorder-agents',
    row: 7,
    listingId: '51f2a34b-4827-441e-ac4c-5c08680d88a3',
    propertyId: 'PP-SANDBOX-SALE-FARM-AUCTION-001',
    expectedReference: 'T2870292',
    kind: 'listing_update',
    controlledPublishArgs: ['--agent-ids=ARCH9-SANDBOX-USER-2,ARCH9-SANDBOX-USER-1'],
  },
  {
    id: 'sale-land-offers-from',
    row: 8,
    listingId: '1670f56a-57c4-4c7b-86e9-17ab05e6d8fb',
    propertyId: 'PP-SANDBOX-SALE-LAND-001',
    expectedReference: 'T2870293',
    kind: 'price_presentation_update',
    salesPricePresentation: 'OffersFrom',
    requiresOffersFrom: true,
  },
]

function parseArgs(argv = []) {
  const options = {
    action: 'all',
    baseline: DEFAULT_BASELINE_PATH,
    newPropertyId: '',
    offersFrom: '',
    output: path.join(appRoot, 'outputs', 'private-property-sale-follow-up.json'),
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
  if (selector === 'all') return SALE_ACTIONS
  const action = SALE_ACTIONS.find((candidate) => candidate.id === selector)
  if (!action) throw new Error(`Unknown sale follow-up action: ${selector}`)
  return [action]
}

function readBaseline(filePath, actions) {
  if (!fs.existsSync(filePath)) return { ready: false, blocker: 'baseline_missing:run_private_property_capture_sandbox_baseline_first', checks: [] }
  try {
    const baseline = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const listings = Array.isArray(baseline?.baseline?.listings) ? baseline.baseline.listings : []
    const checks = actions.map((action) => {
      const listing = listings.find((item) => item.propertyId === action.propertyId)
      const referenceMatches = normalizePrivatePropertyText(listing?.privatePropertyReference).toLowerCase() === action.expectedReference.toLowerCase()
      return { actionId: action.id, propertyId: action.propertyId, status: listing?.captureStatus === 'CAPTURED' && referenceMatches ? 'PASS' : 'BLOCKED' }
    })
    const ready = baseline?.phase === 'private-property-sandbox-phase1-baseline' && baseline?.status === 'CAPTURED' && checks.every((check) => check.status === 'PASS')
    return {
      ready,
      phase: normalizePrivatePropertyText(baseline?.phase),
      status: normalizePrivatePropertyText(baseline?.status),
      generatedAt: normalizePrivatePropertyText(baseline?.generatedAt),
      checks,
      blocker: ready ? '' : 'baseline_not_captured_or_sale_target_mismatch',
    }
  } catch (error) {
    return { ready: false, blocker: `baseline_unreadable:${error.message}`, checks: [] }
  }
}

function runScript(scriptName, args, outputPath) {
  const result = spawnSync(process.execPath, [path.join(appRoot, 'scripts', scriptName), ...args, `--output=${outputPath}`], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return {
    exitCode: result.status,
    stderr: normalizePrivatePropertyText(result.stderr),
    outputPath,
    report: fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null,
  }
}

function sanitizeReport(report = {}) {
  return {
    status: normalizePrivatePropertyText(report.status || report.summary?.status),
    listingPublished: Boolean(report.safety?.listingPublished || report.safety?.listingStatusChanged),
    privatePropertyReference: normalizePrivatePropertyText(report.apiResponse?.privatePropertyReference),
    blockers: Array.isArray(report.blockers) ? report.blockers : [],
    nextStep: normalizePrivatePropertyText(report.nextStep),
  }
}

function validateNewPropertyId(action, options) {
  if (!action.requiresNewPropertyId) return ''
  if (!options.newPropertyId) return 'missing_argument:--new-property-id'
  if (options.newPropertyId === action.propertyId) return 'new_property_id_must_differ_from_current_property_id'
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,100}$/.test(options.newPropertyId)) return 'invalid_new_property_id_format'
  return ''
}

function validateOffersFrom(action, options) {
  if (!action.requiresOffersFrom) return ''
  const amount = Number(options.offersFrom)
  if (!options.offersFrom) return 'missing_argument:--offers-from'
  if (!Number.isFinite(amount) || amount <= 0) return 'invalid_offers_from_amount'
  return ''
}

function executeControlledPublish(action, output, args = []) {
  return runScript('private-property-controlled-publish-rehearsal.mjs', [
    '--apply',
    `--listing-id=${action.listingId}`,
    '--environment=sandbox',
    `--property-id=${action.propertyId}`,
    '--suburb-id=140',
    ...args,
  ], output)
}

function executeAction(action, options) {
  const directory = path.dirname(options.output)
  if (action.id === 'sale-residential-change-unique-id') {
    const report = executeControlledPublish(action, path.join(directory, `${action.id}-submit.json`), [`--property-id=${options.newPropertyId}`])
    return { completed: report.exitCode === 0 && report.report?.status === 'SUBMITTED', steps: [{ name: 'UpdateListing with new unique ID', ...report, summary: sanitizeReport(report.report) }] }
  }
  if (action.id === 'sale-commercial-cancel-showday-reduce-price') {
    const cancel = runScript('private-property-showday-update.mjs', [
      '--apply',
      `--property-id=${action.propertyId}`,
      `--start-date=${action.showday.startDate}`,
      `--end-date=${action.showday.endDate}`,
      `--description=${action.showday.description}`,
      '--active=false',
    ], path.join(directory, `${action.id}-showday-cancel.json`))
    if (cancel.exitCode !== 0 || cancel.report?.status !== 'PASS') {
      return { completed: false, steps: [{ name: 'Cancel show day', ...cancel, summary: sanitizeReport(cancel.report) }] }
    }
    const reduce = executeControlledPublish(action, path.join(directory, `${action.id}-price-reduction.json`), [`--price=${action.reducedPrice}`])
    return {
      completed: reduce.exitCode === 0 && reduce.report?.status === 'SUBMITTED',
      steps: [
        { name: 'Cancel show day', ...cancel, summary: sanitizeReport(cancel.report) },
        { name: 'Reduce sale price by R10,000', ...reduce, summary: sanitizeReport(reduce.report) },
      ],
    }
  }
  if (action.id === 'sale-farm-reorder-agents') {
    const report = executeControlledPublish(action, path.join(directory, `${action.id}-submit.json`), action.controlledPublishArgs)
    return { completed: report.exitCode === 0 && report.report?.status === 'SUBMITTED', steps: [{ name: 'UpdateListing with reversed agent order', ...report, summary: sanitizeReport(report.report) }] }
  }
  if (action.id === 'sale-land-offers-from') {
    const report = executeControlledPublish(action, path.join(directory, `${action.id}-submit.json`), [
      `--sales-price-presentation=${action.salesPricePresentation}`,
      `--offers-from=${options.offersFrom}`,
    ])
    return { completed: report.exitCode === 0 && report.report?.status === 'SUBMITTED', steps: [{ name: 'Set sale price presentation to Offers From', ...report, summary: sanitizeReport(report.report) }] }
  }
  return { completed: false, steps: [] }
}

function buildActionPlan(action) {
  return {
    id: action.id,
    row: action.row,
    target: { listingId: action.listingId, propertyId: action.propertyId, expectedReference: action.expectedReference },
    kind: action.kind,
    executable: true,
    salesPricePresentation: action.salesPricePresentation || null,
    requiresOffersFrom: Boolean(action.requiresOffersFrom),
    executionRules: [
      'Run only this action; compound work is kept inside the action in the documented order.',
      'Do not retry automatically after any ambiguous response.',
      'Capture post-action reference and event status before proceeding.',
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
  const baseline = readBaseline(options.baseline, actions)
  const selectedAction = actions.length === 1 ? actions[0] : null
  const newPropertyIdBlocker = selectedAction ? validateNewPropertyId(selectedAction, options) : ''
  const offersFromBlocker = selectedAction ? validateOffersFrom(selectedAction, options) : ''
  const report = {
    phase: 'private-property-sandbox-phase5-sale-follow-up',
    generatedAt: new Date().toISOString(),
    status: options.apply ? 'BLOCKED' : 'DRY_RUN',
    apply: options.apply,
    baseline: { path: options.baseline, ...baseline },
    actions: actions.map(buildActionPlan),
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
      ...(options.apply && actions.length !== 1 ? ['apply_requires_exactly_one_sale_action'] : []),
      ...(newPropertyIdBlocker ? [newPropertyIdBlocker] : []),
      ...(offersFromBlocker ? [offersFromBlocker] : []),
    ],
    evidence: null,
    nextStep: '',
  }

  if (!options.apply) {
    report.nextStep = baseline.ready
      ? 'Choose one executable sale action and re-run with --apply during the sandbox window.'
      : 'Capture a clean Phase 1 baseline before submitting any sale mutation.'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    return
  }

  if (report.blockers.length) {
    report.nextStep = 'Resolve the baseline, action-selection, unique-ID, or Offers From amount blocker before sending this sale update.'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }

  const execution = executeAction(selectedAction, options)
  report.safety.privatePropertyApiCalled = execution.steps.length > 0
  report.evidence = {
    actionId: selectedAction.id,
    steps: execution.steps.map((step) => ({
      name: step.name,
      outputPath: step.outputPath,
      exitCode: step.exitCode,
      summary: step.summary,
    })),
  }
  if (execution.completed) {
    report.status = 'SUBMITTED'
    report.safety.listingOrAgentChanged = true
    report.nextStep = 'Poll the Private Property event feed and capture the resulting state before running another green action.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('private_property_sale_update_not_confirmed')
    report.nextStep = 'Do not retry automatically. Review the saved action result before deciding whether another request is safe.'
    process.exitCode = 1
  }
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
