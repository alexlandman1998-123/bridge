import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const outputDir = path.join(appRoot, 'outputs')
const PHASE11_EVIDENCE = [
  'private-property-verify-rental-residential-per-week-hide-address.json',
  'private-property-verify-rental-commercial-add-agent-images.json',
  'private-property-sandbox-user-2-inactive.json',
  'private-property-verify-rental-commercial-to-residential.json',
]
const ACTIONS = [
  { id: 'sale-residential-change-unique-id', priorVerification: '' },
  { id: 'sale-commercial-cancel-showday-reduce-price', priorVerification: 'sale-residential-change-unique-id' },
  { id: 'sale-farm-reorder-agents', priorVerification: 'sale-commercial-cancel-showday-reduce-price' },
  { id: 'sale-land-offers-from', priorVerification: 'sale-farm-reorder-agents' },
]

function parseArgs(argv = []) {
  const options = {
    action: 'all',
    apply: false,
    freeze: path.join(outputDir, 'private-property-follow-up-input-freeze.json'),
    phase10: path.join(outputDir, 'private-property-phase10-baseline.json'),
    baseline: path.join(outputDir, 'private-property-sandbox-baseline.json'),
    evidenceDir: outputDir,
    priorVerification: '',
    output: path.join(outputDir, 'private-property-phase12-sale-sequence.json'),
  }
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
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

function verificationPath(evidenceDir, actionId) {
  return path.join(evidenceDir, `private-property-verify-${actionId}.json`)
}

function phase11EvidenceReady(evidenceDir) {
  return PHASE11_EVIDENCE.every((fileName) => {
    const report = readJson(path.join(evidenceDir, fileName))
    return fileName.includes('sandbox-user-2-inactive') ? report?.status === 'COMPLETED' : report?.status === 'VERIFIED'
  })
}

function validateReadiness(options, action) {
  const blockers = []
  const freeze = readJson(options.freeze)
  const phase10 = readJson(options.phase10)
  const baseline = readJson(options.baseline)
  if (freeze?.status !== 'FROZEN' || !freeze?.inputDigest) blockers.push('phase9_input_freeze_not_frozen')
  if (!freeze?.inputs?.saleResidentialNewPropertyId || Number(freeze?.inputs?.saleLandOffersFrom) <= 0) blockers.push('phase9_sale_inputs_missing')
  if (phase10?.status !== 'CAPTURED') blockers.push('phase10_baseline_not_captured')
  if (phase10?.baseline?.inputFreezeDigest !== freeze?.inputDigest) blockers.push('phase10_input_freeze_digest_mismatch')
  if (baseline?.status !== 'CAPTURED') blockers.push('sandbox_baseline_not_captured')
  if (!phase11EvidenceReady(options.evidenceDir)) blockers.push('phase11_rental_sequence_not_verified')
  const priorPath = options.priorVerification || (action.priorVerification ? verificationPath(options.evidenceDir, action.priorVerification) : '')
  if (priorPath && readJson(priorPath)?.status !== 'VERIFIED') blockers.push(`prior_action_not_verified:${action.priorVerification}`)
  return { blockers, freeze, priorPath }
}

function runChild(options, action, freeze) {
  const childOutput = path.join(path.dirname(options.output), `${action.id}-phase12-execution.json`)
  const actionArgs = [
    '--apply',
    `--action=${action.id}`,
    `--baseline=${options.baseline}`,
  ]
  if (action.id === 'sale-residential-change-unique-id') actionArgs.push(`--new-property-id=${freeze.inputs.saleResidentialNewPropertyId}`)
  if (action.id === 'sale-land-offers-from') actionArgs.push(`--offers-from=${freeze.inputs.saleLandOffersFrom}`)
  const result = spawnSync(process.execPath, [path.join(appRoot, 'scripts', 'private-property-run-sale-follow-up.mjs'), ...actionArgs, `--output=${childOutput}`], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { exitCode: result.status, stderr: normalizePrivatePropertyText(result.stderr), report: readJson(childOutput), outputPath: childOutput }
}

function writeReport(report, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const selected = options.action === 'all' ? ACTIONS : ACTIONS.filter((action) => action.id === options.action)
  if (!selected.length) throw new Error(`Unknown Phase 12 action: ${options.action}`)
  const action = selected.length === 1 ? selected[0] : null
  const readiness = action ? validateReadiness(options, action) : { blockers: [], freeze: null, priorPath: '' }
  const blockers = [
    ...(options.apply && !action ? ['apply_requires_exactly_one_phase12_action'] : []),
    ...readiness.blockers,
  ]
  const report = {
    phase: 'private-property-sandbox-phase12-sale-sequence',
    generatedAt: new Date().toISOString(),
    actionId: action?.id || null,
    apply: options.apply,
    status: options.apply ? 'BLOCKED' : blockers.length ? 'BLOCKED' : 'READY_TO_RUN',
    actions: selected.map((item) => ({ id: item.id, requiresPriorVerification: item.priorVerification || null })),
    readiness: { freeze: options.freeze, phase10: options.phase10, baseline: options.baseline, evidenceDir: options.evidenceDir, priorVerification: readiness.priorPath || null },
    safety: { privatePropertyApiCalled: false, databaseWritten: false, listingOrAgentChanged: false, rawCredentialsStored: false, rawSoapStored: false, retryAttempted: false },
    blockers,
    evidence: null,
    nextStep: '',
  }
  if (!options.apply) {
    report.nextStep = report.status === 'READY_TO_RUN'
      ? 'Re-run with --apply for this sale action only, then complete read-only verification before continuing.'
      : 'Resolve the Phase 9/10, Phase 11, or prior-sale verification blocker before running this action.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    if (report.status === 'BLOCKED') process.exitCode = 1
    return
  }
  if (blockers.length) {
    report.nextStep = 'Resolve every blocker before making a Private Property mutation.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  const result = runChild(options, action, readiness.freeze)
  report.safety.privatePropertyApiCalled = true
  report.evidence = { childOutput: result.outputPath, childStatus: result.report?.status || 'MISSING', inputFreezeDigest: readiness.freeze.inputDigest }
  if (result.exitCode === 0 && result.report?.status === 'SUBMITTED') {
    report.status = 'SUBMITTED'
    report.safety.listingOrAgentChanged = true
    report.nextStep = 'Run the read-only verification for this sale action before continuing the Phase 12 sequence.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('phase12_action_not_confirmed')
    report.childError = result.stderr || null
    report.nextStep = 'Do not retry automatically. Review the saved child report before taking any further action.'
    process.exitCode = 1
  }
  writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output: options.output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run()
