import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const DEFAULT_MIN_REPORTS = 1
const DEFAULT_MAX_GATE_DURATION_MS = 120000
const DEFAULT_MAX_BUILD_DURATION_MS = 90000

const REQUIRED_PHASE5_CHECKS = [
  'ui_contract',
  'lifecycle',
  'conversion',
  'performance_pull_through',
  'durable_persistence',
  'lead_requirements',
  'dashboard_telemetry',
  'targeted_lint',
  'production_build',
  'performance_budget',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalizeText(value).toLowerCase())
}

function parseIntegerOption(name, value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
  return parsed
}

function unique(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function parseCsv(value = '') {
  return unique(String(value || '').split(','))
}

function parseArgs(argv = []) {
  const options = {
    inputPaths: [],
    fromStdin: false,
    liveGate: false,
    minReports: null,
    maxGateDurationMs: null,
    maxBuildDurationMs: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = (prefix) => {
      if (arg.includes('=')) return arg.slice(prefix.length)
      index += 1
      return argv[index] || ''
    }

    if (arg === '--stdin') {
      options.fromStdin = true
    } else if (arg === '--live-gate') {
      options.liveGate = true
    } else if (arg === '--input' || arg.startsWith('--input=')) {
      options.inputPaths = unique([...options.inputPaths, ...parseCsv(readValue('--input='))])
    } else if (arg === '--min-reports' || arg.startsWith('--min-reports=')) {
      options.minReports = parseIntegerOption('--min-reports', readValue('--min-reports='), { min: 1, max: 10 })
    } else if (arg === '--max-gate-duration-ms' || arg.startsWith('--max-gate-duration-ms=')) {
      options.maxGateDurationMs = parseIntegerOption('--max-gate-duration-ms', readValue('--max-gate-duration-ms='), { min: 1000, max: 600000 })
    } else if (arg === '--max-build-duration-ms' || arg.startsWith('--max-build-duration-ms=')) {
      options.maxBuildDurationMs = parseIntegerOption('--max-build-duration-ms', readValue('--max-build-duration-ms='), { min: 1000, max: 600000 })
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (options.fromStdin && options.inputPaths.length) {
    throw new Error('Use either --stdin or --input, not both.')
  }

  return options
}

function resolveConfig(env = process.env, options = {}) {
  return {
    inputPaths: options.inputPaths || [],
    fromStdin: Boolean(options.fromStdin),
    liveGate: Boolean(options.liveGate || (!options.fromStdin && !(options.inputPaths || []).length) || parseBoolean(env.RESIDENTIAL_CANVASSING_PHASE6_LIVE_GATE)),
    minReports: options.minReports || parseIntegerOption(
      'RESIDENTIAL_CANVASSING_PHASE6_MIN_REPORTS',
      env.RESIDENTIAL_CANVASSING_PHASE6_MIN_REPORTS || DEFAULT_MIN_REPORTS,
      { min: 1, max: 10 },
    ),
    maxGateDurationMs: options.maxGateDurationMs || parseIntegerOption(
      'RESIDENTIAL_CANVASSING_PHASE6_MAX_GATE_DURATION_MS',
      env.RESIDENTIAL_CANVASSING_PHASE6_MAX_GATE_DURATION_MS || DEFAULT_MAX_GATE_DURATION_MS,
      { min: 1000, max: 600000 },
    ),
    maxBuildDurationMs: options.maxBuildDurationMs || parseIntegerOption(
      'RESIDENTIAL_CANVASSING_PHASE6_MAX_BUILD_DURATION_MS',
      env.RESIDENTIAL_CANVASSING_PHASE6_MAX_BUILD_DURATION_MS || DEFAULT_MAX_BUILD_DURATION_MS,
      { min: 1000, max: 600000 },
    ),
  }
}

function parseJsonReport(value = '') {
  const text = normalizeText(value)
  if (!text) throw new Error('No JSON report was provided.')
  try {
    return JSON.parse(text)
  } catch {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first === -1 || last === -1 || last <= first) throw new Error('Unable to parse a JSON report from command output.')
    return JSON.parse(text.slice(first, last + 1))
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))).toString('utf8')
}

function runLivePhase5Gate() {
  const startedAt = Date.now()
  const result = spawnSync(npmCommand, ['run', 'test:residential-canvassing-launch-readiness'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  const report = result.status === 0 ? parseJsonReport(output) : null
  return {
    report,
    command: 'npm run test:residential-canvassing-launch-readiness',
    exitCode: result.status ?? 1,
    durationMs: Date.now() - startedAt,
    output: result.status === 0 ? '' : output.trim().split('\n').slice(-20).join('\n'),
  }
}

async function collectReports(config = {}) {
  const reports = []
  const evidence = []

  if (config.fromStdin) {
    reports.push(parseJsonReport(await readStdin()))
    evidence.push({ source: 'stdin' })
  }

  for (const inputPath of config.inputPaths || []) {
    reports.push(parseJsonReport(await fs.readFile(inputPath, 'utf8')))
    evidence.push({ source: 'file', path: inputPath })
  }

  if (config.liveGate) {
    const liveGate = runLivePhase5Gate()
    if (liveGate.report) reports.push(liveGate.report)
    evidence.push({
      source: 'live_gate',
      command: liveGate.command,
      exitCode: liveGate.exitCode,
      durationMs: liveGate.durationMs,
      output: liveGate.output || undefined,
    })
  }

  return { reports, evidence }
}

function latestReport(reports = []) {
  return [...reports].sort((left, right) => {
    const leftTime = new Date(left.checkedAt || left.generatedAt || left.startedAt || 0).getTime() || 0
    const rightTime = new Date(right.checkedAt || right.generatedAt || right.startedAt || 0).getTime() || 0
    return rightTime - leftTime
  })[0] || null
}

function getCheckMap(report = {}) {
  return new Map((Array.isArray(report.checks) ? report.checks : []).map((check) => [normalizeText(check.key), check]))
}

function gate(key, label, status, detail = '', metadata = {}) {
  return { key, label, status, detail, ...metadata }
}

function buildOperationsDecision({ reports = [], evidence = [], config = {} } = {}) {
  const report = latestReport(reports)
  const checkMap = getCheckMap(report)
  const gates = []

  gates.push(gate(
    'phase5_report_available',
    'Phase 5 launch-readiness evidence available',
    reports.length >= config.minReports ? 'PASS' : 'BLOCKED',
    `${reports.length} report(s) available; ${config.minReports} required.`,
  ))

  gates.push(gate(
    'phase5_go',
    'Latest Phase 5 gate is GO',
    report?.status === 'GO' && Number(report?.blockerCount || 0) === 0 ? 'PASS' : 'BLOCKED',
    report ? `Latest Phase 5 status is ${report.status || 'unknown'} with ${Number(report.blockerCount || 0)} blocker(s).` : 'No Phase 5 report available.',
  ))

  const missingChecks = REQUIRED_PHASE5_CHECKS.filter((key) => !checkMap.has(key))
  const failedChecks = REQUIRED_PHASE5_CHECKS.filter((key) => checkMap.has(key) && checkMap.get(key)?.status !== 'pass')
  gates.push(gate(
    'required_phase5_checks',
    'All required residential checks passed',
    !missingChecks.length && !failedChecks.length ? 'PASS' : 'BLOCKED',
    missingChecks.length || failedChecks.length
      ? `Missing: ${missingChecks.join(', ') || 'none'}; failed: ${failedChecks.join(', ') || 'none'}.`
      : 'Every required residential launch check is present and passing.',
    { missingChecks, failedChecks },
  ))

  gates.push(gate(
    'read_only_monitor',
    'Monitor is read-only',
    report && report.mutatedData === false ? 'PASS' : 'BLOCKED',
    report ? `Phase 5 mutatedData=${String(report.mutatedData)}.` : 'No Phase 5 report available.',
  ))

  const gateDuration = Number(report?.durationMs || 0)
  gates.push(gate(
    'gate_duration',
    'Launch gate duration within operating threshold',
    gateDuration && gateDuration <= config.maxGateDurationMs ? 'PASS' : gateDuration ? 'WARN' : 'BLOCKED',
    gateDuration ? `${gateDuration}ms observed; ${config.maxGateDurationMs}ms maximum.` : 'No launch gate duration available.',
    { durationMs: gateDuration, thresholdMs: config.maxGateDurationMs },
  ))

  const buildDuration = Number(checkMap.get('production_build')?.durationMs || 0)
  gates.push(gate(
    'build_duration',
    'Production build duration within operating threshold',
    buildDuration && buildDuration <= config.maxBuildDurationMs ? 'PASS' : buildDuration ? 'WARN' : 'BLOCKED',
    buildDuration ? `${buildDuration}ms observed; ${config.maxBuildDurationMs}ms maximum.` : 'Production build check missing duration.',
    { durationMs: buildDuration, thresholdMs: config.maxBuildDurationMs },
  ))

  const liveGateEvidence = evidence.find((item) => item.source === 'live_gate')
  if (liveGateEvidence) {
    gates.push(gate(
      'live_gate_command',
      'Live Phase 5 gate command completed',
      liveGateEvidence.exitCode === 0 ? 'PASS' : 'BLOCKED',
      liveGateEvidence.exitCode === 0 ? 'Live Phase 5 gate completed successfully.' : liveGateEvidence.output || 'Live Phase 5 gate failed.',
    ))
  }

  const blocked = gates.filter((item) => item.status === 'BLOCKED')
  const warnings = gates.filter((item) => item.status === 'WARN')
  const status = blocked.length ? 'PAUSE_ROLLOUT' : warnings.length ? 'HOLD_ROLLOUT' : 'CONTINUE_ROLLOUT'

  return {
    status,
    recommendation: status === 'CONTINUE_ROLLOUT'
      ? 'Continue the residential canvassing launch while monitoring normal operations.'
      : status === 'HOLD_ROLLOUT'
        ? 'Hold expansion and review warning gates before adding more users or offices.'
        : 'Pause rollout until blocked gates are remediated and Phase 5 returns GO.',
    gates,
    blocked,
    warnings,
  }
}

async function run(options = parseArgs(process.argv.slice(2))) {
  const config = resolveConfig(process.env, options)
  const { reports, evidence } = await collectReports(config)
  const decision = buildOperationsDecision({ reports, evidence, config })
  return {
    phase: 6,
    scope: 'residential_canvassing_operational_monitor',
    status: decision.status,
    recommendation: decision.recommendation,
    checkedAt: new Date().toISOString(),
    mutatedData: false,
    inputReportCount: reports.length,
    blockerCount: decision.blocked.length,
    warningCount: decision.warnings.length,
    thresholds: {
      minReports: config.minReports,
      maxGateDurationMs: config.maxGateDurationMs,
      maxBuildDurationMs: config.maxBuildDurationMs,
    },
    gates: decision.gates,
    evidence,
    operatorCommands: [
      'npm run test:residential-canvassing-launch-readiness',
      'npm run report:residential-canvassing-operations',
    ],
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await run()
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (report.status !== 'CONTINUE_ROLLOUT') process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

export {
  REQUIRED_PHASE5_CHECKS,
  buildOperationsDecision,
  parseArgs,
  parseJsonReport,
  resolveConfig,
  run,
}
