import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateAgentPhase6Readiness } from './agent-phase6-release-readiness.mjs'

const config = JSON.parse(readFileSync('config/agent-phase6-release-readiness.json', 'utf8'))
const now = new Date('2026-09-06T12:00:00.000Z')
const recent = '2026-09-06T10:00:00.000Z'
const performanceRows = config.requiredPerformanceSurfaces.flatMap((surface) => (
  ['cold', 'warm'].flatMap((temperature) => ['core_ready', 'settled'].map((checkpoint) => ({
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
  })))
))
const passingBrowser = (role) => ({
  contract: 'arch9-agent-phase0-browser-baseline-v1',
  role,
  capturedAt: recent,
  results: [{
    route: '/pipeline/calendar',
    state: 'ready',
    technicalErrorVisible: false,
    consoleErrors: [],
    failedRequests: [],
    horizontalOverflowPx: 0,
    unnamedControls: [],
    focusReachedControl: true,
  }],
})
const evidence = {
  config,
  now,
  rls: {
    contract: 'arch9-agent-phase2-rls-acceptance-v1',
    actorContract: 'arch9-agent-phase2-rls-actors-v2',
    migration: '20260906065759_agent_phase2_rls_acceptance.sql',
    status: 'PASS',
    capturedAt: recent,
    results: config.requiredRlsActors.map((name) => ({
      name,
      deniedOrganisationProbes: [{ table: 'transactions', status: 'PASS' }],
      deniedBranchProbeStatus: name === 'branch_manager' ? 'PASS' : undefined,
    })),
  },
  performance: {
    contract: 'arch9-agent-performance-baseline-report-v2',
    status: 'PASS',
    minimumSamples: 20,
    generatedAt: recent,
    rows: performanceRows,
  },
  browsers: Object.fromEntries(config.requiredBrowserRoles.map((role) => [role, passingBrowser(role)])),
}

const passing = evaluateAgentPhase6Readiness(evidence)
assert.equal(passing.status, 'GO')
assert.deepEqual(passing.blockers, [])

const unsafe = structuredClone(evidence)
unsafe.rls.results = unsafe.rls.results.filter((actor) => actor.name !== 'inactive_agent')
unsafe.performance.status = 'INSUFFICIENT_DATA'
unsafe.browsers.principal.results[0].unnamedControls = ['<button></button>']
const held = evaluateAgentPhase6Readiness(unsafe)
assert.equal(held.status, 'HOLD')
assert.ok(held.blockers.some((blocker) => blocker.includes('inactive_agent')))
assert.ok(held.blockers.some((blocker) => blocker.includes('Performance evidence')))
assert.ok(held.blockers.some((blocker) => blocker.includes('principal browser acceptance')))

const stale = structuredClone(evidence)
stale.rls.capturedAt = '2026-08-01T00:00:00.000Z'
assert.equal(evaluateAgentPhase6Readiness(stale).status, 'HOLD', 'Stale evidence must never authorize release.')

const legacyRls = structuredClone(evidence)
delete legacyRls.rls.actorContract
delete legacyRls.rls.migration
assert.equal(evaluateAgentPhase6Readiness(legacyRls).status, 'HOLD', 'Legacy RLS evidence must never authorize scale release.')

const browserSmoke = readFileSync('scripts/agent-phase0-browser-smoke.mjs', 'utf8')
assert.match(browserSmoke, /`\$\{expectedRole\}-acceptance\.json`/, 'Each role must retain a separate acceptance report.')
assert.match(browserSmoke, /roleOutputDirectory/, 'Each role must retain separate screenshots.')

console.log('Agent Phase 6 release-readiness checks passed.')
