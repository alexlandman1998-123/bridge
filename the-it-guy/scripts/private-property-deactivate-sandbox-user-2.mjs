import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const AGENT_ID = 'ARCH9-SANDBOX-USER-2'
const DEFAULT_BASELINE_PATH = path.join(appRoot, 'outputs', 'private-property-sandbox-baseline.json')

function parseArgs(argv = []) {
  const options = {
    apply: false,
    baseline: DEFAULT_BASELINE_PATH,
    email: '',
    mobile: '',
    output: path.join(appRoot, 'outputs', 'private-property-sandbox-user-2-inactive.json'),
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

function writeReport(report, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  return outputPath
}

function readBaseline(filePath) {
  if (!fs.existsSync(filePath)) {
    return { ready: false, blocker: 'baseline_missing:run_private_property_capture_sandbox_baseline_first' }
  }
  try {
    const baseline = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const agent = Array.isArray(baseline?.baseline?.agents)
      ? baseline.baseline.agents.find((item) => item.agentId === AGENT_ID)
      : null
    const ready = baseline?.phase === 'private-property-sandbox-phase1-baseline' &&
      baseline?.status === 'CAPTURED' &&
      Boolean(agent)
    return {
      ready,
      phase: normalizePrivatePropertyText(baseline?.phase),
      status: normalizePrivatePropertyText(baseline?.status),
      generatedAt: normalizePrivatePropertyText(baseline?.generatedAt),
      agentId: agent?.agentId || '',
      blocker: ready ? '' : 'baseline_not_captured_or_agent_id_mismatch',
    }
  } catch (error) {
    return { ready: false, blocker: `baseline_unreadable:${error.message}` }
  }
}

function sanitizeChildReport(report = {}) {
  return {
    status: normalizePrivatePropertyText(report?.summary?.status || report?.status),
    agentId: normalizePrivatePropertyText(report?.agent?.agentId || report?.agentId),
    updateAgentStatus: Array.isArray(report?.checks)
      ? normalizePrivatePropertyText(report.checks.find((check) => check.name === 'UpdateAgent SOAP write')?.status)
      : '',
    blockedCount: Number(report?.summary?.blockedCount) || 0,
    skippedCount: Number(report?.summary?.skippedCount) || 0,
  }
}

function invokeAgentUpdate(options, agentOutput) {
  const result = spawnSync(process.execPath, [
    path.join(appRoot, 'scripts', 'private-property-create-agent.mjs'),
    '--apply',
    '--sandbox-user=2',
    `--agent-id=${AGENT_ID}`,
    `--email=${options.email}`,
    `--mobile=${options.mobile}`,
    '--inactive',
    `--output=${agentOutput}`,
  ], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const childReport = fs.existsSync(agentOutput) ? JSON.parse(fs.readFileSync(agentOutput, 'utf8')) : null
  return {
    exitCode: result.status,
    childReport,
    stderr: normalizePrivatePropertyText(result.stderr),
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const baseline = readBaseline(options.baseline)
  const missingArguments = []
  if (options.apply && !options.email) missingArguments.push('--email')
  if (options.apply && !options.mobile) missingArguments.push('--mobile')
  const report = {
    phase: 'private-property-sandbox-phase3-agent-lifecycle',
    generatedAt: new Date().toISOString(),
    status: options.apply ? 'BLOCKED' : 'DRY_RUN',
    apply: options.apply,
    actionId: 'agent-user-2-inactive',
    agent: { agentId: AGENT_ID, intendedActive: false },
    baseline: { path: options.baseline, ...baseline },
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
      ...missingArguments.map((argument) => `missing_argument:${argument}`),
    ],
    evidence: null,
    nextStep: '',
  }

  if (!options.apply) {
    report.nextStep = baseline.ready
      ? 'Ready to make one UpdateAgent call. Re-run with --apply plus the agent email and mobile number when the sandbox is available.'
      : 'Capture a clean Phase 1 baseline before making any agent lifecycle change.'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    return
  }

  if (report.blockers.length) {
    report.nextStep = 'Resolve the listed baseline or argument blockers before making the one permitted agent update.'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }

  const agentOutput = path.join(path.dirname(options.output), 'private-property-agent-user-2-inactive-result.json')
  const result = invokeAgentUpdate(options, agentOutput)
  report.safety.privatePropertyApiCalled = true
  report.evidence = {
    childOutput: agentOutput,
    agentUpdate: sanitizeChildReport(result.childReport),
  }
  if (result.exitCode === 0 && report.evidence.agentUpdate.status === 'PASS' && report.evidence.agentUpdate.updateAgentStatus === 'PASS') {
    report.status = 'COMPLETED'
    report.safety.listingOrAgentChanged = true
    report.nextStep = 'Record ARCH9-SANDBOX-USER-2 in the spreadsheet and continue with the next green action. Do not rerun this deactivation.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('private_property_agent_update_not_confirmed')
    report.evidence.agentUpdateError = result.stderr || 'Private Property did not return a confirmed UpdateAgent success result.'
    report.nextStep = 'Do not retry automatically. Review the saved child result and Private Property response before deciding whether another request is safe.'
    process.exitCode = 1
  }
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
