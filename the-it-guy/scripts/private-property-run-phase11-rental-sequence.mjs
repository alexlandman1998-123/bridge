import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const outputDir = path.join(appRoot, 'outputs')

const ACTIONS = [
  { id: 'rental-residential-per-week-hide-address', runner: 'rental', priorVerification: '' },
  { id: 'rental-commercial-add-agent-images', runner: 'rental', priorVerification: 'rental-residential-per-week-hide-address' },
  { id: 'agent-user-2-inactive', runner: 'agent', priorVerification: 'rental-commercial-add-agent-images' },
  { id: 'rental-commercial-to-residential', runner: 'rental', requiresAgentEvidence: true },
]

function parseArgs(argv = []) {
  const options = {
    action: 'all',
    apply: false,
    freeze: path.join(outputDir, 'private-property-follow-up-input-freeze.json'),
    phase10: path.join(outputDir, 'private-property-phase10-baseline.json'),
    baseline: path.join(outputDir, 'private-property-sandbox-baseline.json'),
    priorVerification: '',
    agentEvidence: path.join(outputDir, 'private-property-sandbox-user-2-inactive.json'),
    email: '',
    mobile: '',
    output: path.join(outputDir, 'private-property-phase11-rental-sequence.json'),
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

function expectedVerificationPath(actionId) {
  return path.join(outputDir, `private-property-verify-${actionId}.json`)
}

function validateReadiness(options, action) {
  const blockers = []
  const freeze = readJson(options.freeze)
  const phase10 = readJson(options.phase10)
  const baseline = readJson(options.baseline)
  if (freeze?.status !== 'FROZEN' || !freeze?.inputDigest) blockers.push('phase9_input_freeze_not_frozen')
  if (phase10?.status !== 'CAPTURED') blockers.push('phase10_baseline_not_captured')
  if (phase10?.baseline?.inputFreezeDigest !== freeze?.inputDigest) blockers.push('phase10_input_freeze_digest_mismatch')
  if (baseline?.status !== 'CAPTURED') blockers.push('sandbox_baseline_not_captured')
  const priorPath = options.priorVerification || (action.priorVerification ? expectedVerificationPath(action.priorVerification) : '')
  if (priorPath && readJson(priorPath)?.status !== 'VERIFIED') blockers.push(`prior_action_not_verified:${action.priorVerification}`)
  if (action.requiresAgentEvidence && readJson(options.agentEvidence)?.status !== 'COMPLETED') blockers.push('agent_user_2_inactive_not_confirmed')
  if (options.apply && action.runner === 'agent' && !options.email) blockers.push('missing_argument:--email')
  if (options.apply && action.runner === 'agent' && !options.mobile) blockers.push('missing_argument:--mobile')
  return { blockers, priorPath }
}

function runChild(script, args, outputPath) {
  const result = spawnSync(process.execPath, [path.join(appRoot, 'scripts', script), ...args, `--output=${outputPath}`], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { exitCode: result.status, stderr: normalizePrivatePropertyText(result.stderr), report: readJson(outputPath), outputPath }
}

function executeAction(options, action) {
  const childOutput = path.join(path.dirname(options.output), `${action.id}-phase11-execution.json`)
  if (action.runner === 'agent') {
    return runChild('private-property-deactivate-sandbox-user-2.mjs', [
      '--apply',
      `--baseline=${options.baseline}`,
      `--email=${options.email}`,
      `--mobile=${options.mobile}`,
    ], childOutput)
  }
  return runChild('private-property-run-rental-follow-up.mjs', [
    '--apply',
    `--action=${action.id}`,
    `--baseline=${options.baseline}`,
  ], childOutput)
}

function writeReport(report, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const selected = options.action === 'all' ? ACTIONS : ACTIONS.filter((action) => action.id === options.action)
  if (!selected.length) throw new Error(`Unknown Phase 11 action: ${options.action}`)
  const action = selected.length === 1 ? selected[0] : null
  const readiness = action ? validateReadiness(options, action) : { blockers: [], priorPath: '' }
  const blockers = [
    ...(options.apply && !action ? ['apply_requires_exactly_one_phase11_action'] : []),
    ...readiness.blockers,
  ]
  const report = {
    phase: 'private-property-sandbox-phase11-rental-sequence',
    generatedAt: new Date().toISOString(),
    actionId: action?.id || null,
    apply: options.apply,
    status: options.apply ? 'BLOCKED' : blockers.length ? 'BLOCKED' : 'READY_TO_RUN',
    actions: selected.map((item) => ({ id: item.id, runner: item.runner, requiresPriorVerification: item.priorVerification || null, requiresAgentEvidence: Boolean(item.requiresAgentEvidence) })),
    readiness: { freeze: options.freeze, phase10: options.phase10, baseline: options.baseline, priorVerification: readiness.priorPath || null },
    safety: { privatePropertyApiCalled: false, databaseWritten: false, listingOrAgentChanged: false, rawCredentialsStored: false, agentContactStored: false, retryAttempted: false },
    blockers,
    evidence: null,
    nextStep: '',
  }
  if (!options.apply) {
    report.nextStep = report.status === 'READY_TO_RUN'
      ? 'Re-run with --apply for this action only, then complete read-only verification before continuing.'
      : 'Resolve the Phase 9/10 or preceding-action blocker before running this rental action.'
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
  const result = executeAction(options, action)
  report.safety.privatePropertyApiCalled = true
  report.evidence = { childOutput: result.outputPath, childStatus: result.report?.status || 'MISSING' }
  const completed = action.runner === 'agent'
    ? result.exitCode === 0 && result.report?.status === 'COMPLETED'
    : result.exitCode === 0 && result.report?.status === 'SUBMITTED'
  if (completed) {
    report.status = 'SUBMITTED'
    report.safety.listingOrAgentChanged = true
    report.nextStep = action.runner === 'agent'
      ? 'Agent deactivation is recorded. Run the read-only agent verification before row 4.'
      : 'Run the read-only verification for this action before continuing the Phase 11 sequence.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('phase11_action_not_confirmed')
    report.childError = result.stderr || null
    report.nextStep = 'Do not retry automatically. Review the saved child report before taking any further action.'
    process.exitCode = 1
  }
  writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output: options.output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run()
