import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  REQUIRED_PHASE5_CHECKS,
  buildOperationsDecision,
  parseArgs,
  parseJsonReport,
  resolveConfig,
} from './residential-canvassing-operations-monitor.mjs'

function phase5Report(overrides = {}) {
  const checks = REQUIRED_PHASE5_CHECKS.map((key) => ({
    key,
    label: key,
    status: 'pass',
    exitCode: 0,
    durationMs: key === 'production_build' ? 45000 : 500,
  }))
  return {
    phase: 5,
    scope: 'residential_canvassing_launch_readiness',
    status: 'GO',
    startedAt: '2026-08-02T17:33:11.109Z',
    checkedAt: '2026-08-02T17:34:02.992Z',
    durationMs: 52000,
    mutatedData: false,
    blockerCount: 0,
    checks,
    blockers: [],
    ...overrides,
  }
}

const parsed = parseArgs([
  '--input=phase5-a.json,phase5-b.json',
  '--min-reports=2',
  '--max-gate-duration-ms=150000',
  '--max-build-duration-ms=120000',
])
assert.deepEqual(parsed.inputPaths, ['phase5-a.json', 'phase5-b.json'])
assert.equal(parsed.minReports, 2)
assert.equal(parsed.maxGateDurationMs, 150000)
assert.equal(parsed.maxBuildDurationMs, 120000)
assert.throws(() => parseArgs(['--stdin', '--input=phase5.json']), /either --stdin or --input/i)
assert.throws(() => parseArgs(['--max-build-duration-ms=0']), /--max-build-duration-ms/)

const config = resolveConfig(
  {
    RESIDENTIAL_CANVASSING_PHASE6_MIN_REPORTS: '2',
    RESIDENTIAL_CANVASSING_PHASE6_MAX_GATE_DURATION_MS: '180000',
    RESIDENTIAL_CANVASSING_PHASE6_MAX_BUILD_DURATION_MS: '150000',
  },
  parseArgs([]),
)
assert.equal(config.liveGate, true)
assert.equal(config.minReports, 2)
assert.equal(config.maxGateDurationMs, 180000)
assert.equal(config.maxBuildDurationMs, 150000)

assert.equal(parseJsonReport('prefix\n{"status":"GO"}\nsuffix').status, 'GO')

const continueDecision = buildOperationsDecision({
  reports: [phase5Report()],
  evidence: [{ source: 'file', path: 'phase5.json' }],
  config: { minReports: 1, maxGateDurationMs: 120000, maxBuildDurationMs: 90000 },
})
assert.equal(continueDecision.status, 'CONTINUE_ROLLOUT')
assert.equal(continueDecision.blocked.length, 0)
assert.equal(continueDecision.warnings.length, 0)

const holdDecision = buildOperationsDecision({
  reports: [phase5Report({
    durationMs: 130000,
    checks: REQUIRED_PHASE5_CHECKS.map((key) => ({
      key,
      label: key,
      status: 'pass',
      exitCode: 0,
      durationMs: key === 'production_build' ? 95000 : 500,
    })),
  })],
  config: { minReports: 1, maxGateDurationMs: 120000, maxBuildDurationMs: 90000 },
})
assert.equal(holdDecision.status, 'HOLD_ROLLOUT')
assert.equal(holdDecision.warnings.some((gate) => gate.key === 'gate_duration'), true)
assert.equal(holdDecision.warnings.some((gate) => gate.key === 'build_duration'), true)

const pauseDecision = buildOperationsDecision({
  reports: [phase5Report({
    status: 'NO_GO',
    blockerCount: 1,
    checks: REQUIRED_PHASE5_CHECKS.filter((key) => key !== 'conversion').map((key) => ({
      key,
      label: key,
      status: key === 'performance_pull_through' ? 'blocked' : 'pass',
      exitCode: key === 'performance_pull_through' ? 1 : 0,
      durationMs: 500,
    })),
  })],
  evidence: [{ source: 'live_gate', exitCode: 1, output: 'conversion failed' }],
  config: { minReports: 1, maxGateDurationMs: 120000, maxBuildDurationMs: 90000 },
})
assert.equal(pauseDecision.status, 'PAUSE_ROLLOUT')
assert.equal(pauseDecision.blocked.some((gate) => gate.key === 'phase5_go'), true)
assert.equal(pauseDecision.blocked.some((gate) => gate.key === 'required_phase5_checks'), true)
assert.equal(pauseDecision.blocked.some((gate) => gate.key === 'live_gate_command'), true)

const packageJson = await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageJson, /test:residential-canvassing-operations/)
assert.match(packageJson, /report:residential-canvassing-operations/)

console.log('residential canvassing operations monitor checks passed')
