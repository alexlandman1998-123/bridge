import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const outputDir = path.join(appRoot, 'outputs')
const ACTIONS = new Set([
  'rental-residential-per-week-hide-address',
  'rental-commercial-add-agent-images',
  'agent-user-2-inactive',
  'rental-commercial-to-residential',
  'sale-residential-change-unique-id',
  'sale-commercial-cancel-showday-reduce-price',
  'sale-farm-reorder-agents',
  'sale-land-offers-from',
])

function parseArgs(argv = []) {
  const options = {
    action: '',
    verify: false,
    freeze: path.join(outputDir, 'private-property-follow-up-input-freeze.json'),
    baseline: path.join(outputDir, 'private-property-sandbox-baseline.json'),
    executionReport: '',
    verificationOutput: '',
    continuationKey: '0',
    startDateTime: '',
    branchGuid: '',
    output: path.join(outputDir, 'private-property-phase13-verification.json'),
  }
  for (const arg of argv) {
    if (arg === '--verify') {
      options.verify = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    if (!Object.hasOwn(options, key)) throw new Error(`Unknown option: ${arg}`)
    options[key] = normalizePrivatePropertyText(match[2])
  }
  return options
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function defaultExecutionReport(actionId) {
  return path.join(outputDir, actionId.startsWith('sale-')
    ? 'private-property-phase12-sale-sequence.json'
    : 'private-property-phase11-rental-sequence.json')
}

function defaultVerificationOutput(actionId) {
  return path.join(outputDir, `private-property-verify-${actionId}.json`)
}

function buildVerificationArgs(options, freeze, executionReport) {
  const args = [
    '--verify',
    `--action=${options.action}`,
    `--baseline=${options.baseline}`,
    `--continuation-key=${options.continuationKey}`,
    `--start-date-time=${options.startDateTime}`,
    `--output=${options.verificationOutput || defaultVerificationOutput(options.action)}`,
  ]
  if (options.branchGuid) args.push(`--branch-guid=${options.branchGuid}`)
  if (options.action === 'sale-residential-change-unique-id') args.push(`--new-property-id=${freeze.inputs.saleResidentialNewPropertyId}`)
  if (options.action === 'sale-land-offers-from') args.push(`--offers-from=${freeze.inputs.saleLandOffersFrom}`)
  if (options.action === 'agent-user-2-inactive' && executionReport?.evidence?.childOutput) args.push(`--agent-evidence=${executionReport.evidence.childOutput}`)
  return args
}

function writeReport(report, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const freeze = readJson(options.freeze)
  const executionPath = options.executionReport || defaultExecutionReport(options.action)
  const executionReport = readJson(executionPath)
  const blockers = []
  if (!ACTIONS.has(options.action)) blockers.push('missing_or_invalid_argument:--action')
  if (freeze?.status !== 'FROZEN' || !freeze?.inputDigest) blockers.push('phase9_input_freeze_not_frozen')
  if (readJson(options.baseline)?.status !== 'CAPTURED') blockers.push('sandbox_baseline_not_captured')
  if (!executionReport) blockers.push('action_execution_report_missing')
  if (executionReport && (executionReport.actionId !== options.action || executionReport.status !== 'SUBMITTED')) blockers.push('action_execution_not_confirmed')
  const report = {
    phase: 'private-property-sandbox-phase13-verification',
    generatedAt: new Date().toISOString(),
    actionId: options.action || null,
    verify: options.verify,
    status: options.verify ? 'BLOCKED' : blockers.length ? 'BLOCKED' : 'READY_TO_VERIFY',
    executionReport: executionPath,
    verificationOutput: options.verificationOutput || defaultVerificationOutput(options.action),
    safety: { privatePropertyApiCalled: false, databaseWritten: false, listingOrAgentChanged: false, rawCredentialsStored: false, rawSoapStored: false },
    blockers,
    verification: null,
    nextStep: '',
  }
  if (!options.verify) {
    report.nextStep = report.status === 'READY_TO_VERIFY'
      ? 'Re-run with --verify to perform the read-only Private Property verification.'
      : 'Resolve the listed execution or baseline blocker before verification.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    if (report.status === 'BLOCKED') process.exitCode = 1
    return
  }
  if (blockers.length) {
    report.nextStep = 'Do not make another mutation. Resolve the listed evidence blocker before verification.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  const child = spawnSync(process.execPath, [path.join(appRoot, 'scripts', 'private-property-verify-follow-up-action.mjs'), ...buildVerificationArgs(options, freeze, executionReport)], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const verification = readJson(report.verificationOutput)
  report.safety.privatePropertyApiCalled = options.action !== 'agent-user-2-inactive'
  report.verification = { output: report.verificationOutput, status: verification?.status || 'MISSING' }
  if (child.status === 0 && verification?.status === 'VERIFIED') {
    report.status = 'VERIFIED'
    report.nextStep = 'Verification is complete. The next ordered action may now be run.'
  } else {
    report.status = verification?.status === 'PENDING_MANUAL_CHECK' ? 'PENDING_MANUAL_CHECK' : 'ATTENTION_REQUIRED'
    report.blockers.push('phase13_verification_not_complete')
    report.childError = normalizePrivatePropertyText(child.stderr) || null
    report.nextStep = report.status === 'PENDING_MANUAL_CHECK'
      ? 'Complete the named manual portal check before running the next mutation.'
      : 'Do not retry or mutate again. Review the saved verification report and Private Property response.'
    process.exitCode = 1
  }
  writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output: options.output, verificationOutput: report.verificationOutput, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run()
