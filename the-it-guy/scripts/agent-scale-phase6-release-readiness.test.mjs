import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateAgentPhase6Readiness } from './agent-phase6-release-readiness.mjs'

const config = JSON.parse(readFileSync('config/agent-phase6-release-readiness.json', 'utf8'))
const readinessSource = readFileSync('scripts/agent-phase6-release-readiness.mjs', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(config.contract, 'arch9-agent-phase6-release-readiness-config-v2')
assert.equal(config.minimumPerformanceSamples, 20)
assert.ok(config.requiredPerformanceSurfaces.includes('calendar'))
assert.ok(config.requiredBrowserRoutes.includes('/pipeline/calendar'))
assert.deepEqual(config.calendarSettledBudgets, {
  requestCountP95: 8,
  duplicateRequestCountP95: 0,
  slowRequestCountP95: 0,
  transferredBytesP95: 400000,
})
assert.match(readinessSource, /createHash\('sha256'\)/)
assert.match(readinessSource, /evidenceDigests/)

const now = new Date('2026-09-06T12:00:00.000Z')
const recent = '2026-09-06T10:00:00.000Z'
const rows = config.requiredPerformanceSurfaces.flatMap((surface) => ['cold', 'warm'].flatMap((temperature) => ['core_ready', 'settled'].map((checkpoint) => ({
  surface,
  temperature,
  checkpoint,
  sampleCount: 20,
  coverage: 'COMPLETE',
  status: 'PASS',
  ...(surface === 'calendar' && checkpoint === 'settled' ? {
    requestCountP95: 6,
    duplicateRequestCountP95: 0,
    slowRequestCountP95: 0,
    transferredBytesP95: 250000,
  } : {}),
}))))
const browser = (role) => ({
  contract: 'arch9-agent-phase0-browser-baseline-v1', role, capturedAt: recent,
  results: [{ route: '/pipeline/calendar', state: 'ready', technicalErrorVisible: false, consoleErrors: [], failedRequests: [], horizontalOverflowPx: 0, unnamedControls: [], focusReachedControl: true }],
})
const evidence = {
  config,
  now,
  rls: {
    contract: 'arch9-agent-phase2-rls-acceptance-v1', actorContract: 'arch9-agent-phase2-rls-actors-v2',
    migration: '20260906065759_agent_phase2_rls_acceptance.sql', status: 'PASS', capturedAt: recent,
    results: config.requiredRlsActors.map((name) => ({ name, deniedOrganisationProbes: [{ status: 'PASS' }], deniedBranchProbeStatus: name === 'branch_manager' ? 'PASS' : undefined })),
  },
  performance: { contract: 'arch9-agent-performance-baseline-report-v2', status: 'PASS', generatedAt: recent, minimumSamples: 20, rows },
  browsers: Object.fromEntries(config.requiredBrowserRoles.map((role) => [role, browser(role)])),
}

assert.equal(evaluateAgentPhase6Readiness(evidence).status, 'GO')

const lowSamples = structuredClone(evidence)
lowSamples.performance.rows.find((row) => row.surface === 'calendar').sampleCount = 19
assert.equal(evaluateAgentPhase6Readiness(lowSamples).status, 'HOLD')

const duplicateRequests = structuredClone(evidence)
duplicateRequests.performance.rows.filter((row) => row.surface === 'calendar' && row.checkpoint === 'settled').forEach((row) => { row.duplicateRequestCountP95 = 1 })
assert.equal(evaluateAgentPhase6Readiness(duplicateRequests).status, 'HOLD')

const missingCalendarBrowser = structuredClone(evidence)
missingCalendarBrowser.browsers.agent.results[0].route = '/dashboard'
assert.equal(evaluateAgentPhase6Readiness(missingCalendarBrowser).status, 'HOLD')

assert.equal(typeof packageJson.scripts['test:agent-scale-phase6'], 'string')
assert.match(packageJson.scripts['verify:agent-scale-phase6'], /verify:agent-scale-phase5/)

console.log('Agent scale Phase 6 release-readiness checks passed.')
