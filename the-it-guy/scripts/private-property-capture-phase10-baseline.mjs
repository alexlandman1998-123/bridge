import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv = []) {
  const options = {
    capture: false,
    freeze: path.join(appRoot, 'outputs', 'private-property-follow-up-input-freeze.json'),
    baselineOutput: path.join(appRoot, 'outputs', 'private-property-sandbox-baseline.json'),
    output: path.join(appRoot, 'outputs', 'private-property-phase10-baseline.json'),
    continuationKey: '0',
    startDateTime: '',
  }
  for (const arg of argv) {
    if (arg === '--capture') {
      options.capture = true
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

function readFreeze(filePath) {
  if (!fs.existsSync(filePath)) return { ready: false, blocker: 'phase9_input_freeze_missing' }
  try {
    const report = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const ready = report?.phase === 'private-property-sandbox-phase9-input-freeze' &&
      report?.status === 'FROZEN' &&
      Boolean(report?.inputDigest) &&
      Boolean(report?.inputs?.saleResidentialNewPropertyId) &&
      Number(report?.inputs?.saleLandAskingPrice) > 0 &&
      Number(report?.inputs?.saleLandOffersFrom) > 0
    return { ready, status: report?.status || '', inputDigest: report?.inputDigest || '', blocker: ready ? '' : 'phase9_input_freeze_invalid' }
  } catch (error) {
    return { ready: false, blocker: `phase9_input_freeze_unreadable:${error.message}` }
  }
}

function writeReport(report, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
}

function invokeBaselineCapture(options) {
  const result = spawnSync(process.execPath, [
    path.join(appRoot, 'scripts', 'private-property-capture-sandbox-baseline.mjs'),
    '--capture',
    `--continuation-key=${options.continuationKey}`,
    `--start-date-time=${options.startDateTime}`,
    `--output=${options.baselineOutput}`,
  ], { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  let report = null
  try {
    report = JSON.parse(fs.readFileSync(options.baselineOutput, 'utf8'))
  } catch {
    // The child result and stderr remain sufficient evidence when no report was written.
  }
  return { exitCode: result.status, stderr: normalizePrivatePropertyText(result.stderr), report }
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const freeze = readFreeze(options.freeze)
  const blockers = freeze.ready ? [] : [freeze.blocker]
  const report = {
    phase: 'private-property-sandbox-phase10-fresh-baseline',
    generatedAt: new Date().toISOString(),
    capture: options.capture,
    status: options.capture ? 'BLOCKED' : 'DRY_RUN',
    inputFreeze: { path: options.freeze, ...freeze },
    baselineOutput: options.baselineOutput,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingOrAgentChanged: false,
      rawCredentialsStored: false,
      rawSoapStored: false,
    },
    blockers,
    baseline: null,
    nextStep: '',
  }

  if (!options.capture) {
    report.status = blockers.length ? 'BLOCKED' : 'READY_TO_CAPTURE'
    report.nextStep = blockers.length
      ? 'Freeze valid Phase 9 inputs before capturing the sandbox baseline.'
      : 'Re-run with --capture during the sandbox window to record the fresh before-state snapshot.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    if (report.status === 'BLOCKED') process.exitCode = 1
    return
  }

  if (blockers.length) {
    report.nextStep = 'Resolve the Phase 9 input freeze before making any Private Property read calls.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }

  const baselineCapture = invokeBaselineCapture(options)
  report.safety.privatePropertyApiCalled = true
  report.baseline = {
    status: baselineCapture.report?.status || 'MISSING',
    generatedAt: baselineCapture.report?.generatedAt || null,
    listingCount: Array.isArray(baselineCapture.report?.baseline?.listings) ? baselineCapture.report.baseline.listings.length : 0,
    blockers: Array.isArray(baselineCapture.report?.blockers) ? baselineCapture.report.blockers : [],
    inputFreezeDigest: freeze.inputDigest,
  }
  if (baselineCapture.exitCode === 0 && baselineCapture.report?.status === 'CAPTURED') {
    report.status = 'CAPTURED'
    report.nextStep = 'Phase 10 baseline captured. Begin Phase 11 with the first rental action only.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('fresh_sandbox_baseline_not_captured')
    report.childError = baselineCapture.stderr || null
    report.nextStep = 'Do not run a mutation. Resolve the captured baseline issue, then re-run this read-only Phase 10 step.'
    process.exitCode = 1
  }
  writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output: options.output, baselineOutput: options.baselineOutput, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run()
