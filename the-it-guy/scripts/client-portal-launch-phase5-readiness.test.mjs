import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [gate, metrics, clientPortal, buyerPortal, evidence, rollout, docs] = await Promise.all([
  readFile(new URL('scripts/client-portal-launch-phase5-readiness.mjs', root), 'utf8'),
  readFile(new URL('src/hooks/useClientPortalLaunchMetrics.js', root), 'utf8'),
  readFile(new URL('src/pages/ClientPortal.jsx', root), 'utf8'),
  readFile(new URL('src/pages/ProspectBuyerDemo.jsx', root), 'utf8'),
  readFile(new URL('config/client-portal-launch-phase5-evidence.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('config/client-portal-launch-phase5-rollout.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('docs/client-portal-launch-phase5-release-readiness.md', root), 'utf8'),
])

test('launch metrics collect useful content, LCP and CLS without portal identifiers', () => {
  assert.match(metrics, /usefulContentMs/)
  assert.match(metrics, /largestContentfulPaintMs/)
  assert.match(metrics, /cumulativeLayoutShift/)
  assert.match(metrics, /dataset\.clientPortalLaunchMetrics/)
  assert.doesNotMatch(metrics, /(?:token|email|phone)\s*:/i)
  assert.match(clientPortal, /useClientPortalLaunchMetrics/)
  assert.match(buyerPortal, /useClientPortalLaunchMetrics/)
})

test('release evidence covers every Phase 0 manual gate', () => {
  assert.deepEqual(Object.keys(evidence.evidence), [
    'productionPerformance',
    'physicalDevices',
    'capabilityParity',
    'accessibility',
    'operations',
    'defects',
    'productOwnerSignoff',
  ])
})

test('controlled rollout is disabled, bounded and never expands automatically', () => {
  assert.equal(rollout.status, 'disabled')
  assert.equal(rollout.maximumPilotAgencies, 1)
  assert.equal(rollout.automaticExpansion, false)
  assert.ok(rollout.rollbackTriggers.length >= 5)
})

test('gate checks build size, budgets, evidence URLs, owners and signoff', () => {
  assert.match(gate, /clientPortalChunkWithinBudget/)
  assert.match(gate, /mobileUsefulContentMs/)
  assert.match(gate, /evidence_url:/)
  assert.match(gate, /rollbackTestResult/)
  assert.match(gate, /signedOffBy/)
})

test('unfilled evidence fails closed with HOLD', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5-readiness.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'HOLD')
  assert.equal(report.automated.phase2ResponsiveFoundationPresent, true)
  assert.ok(!report.blockers.includes('automated:phase2ResponsiveFoundationPresent'))
  assert.ok(report.blockers.includes('evidence:productionPerformance'))
  assert.ok(report.blockers.includes('evidence:physicalDevices'))
  assert.ok(report.blockers.includes('evidence:productOwnerSignoff'))
})

test('enforced release command returns non-zero while evidence is incomplete', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5-readiness.mjs', '--enforce'], {
    cwd: new URL('.', root),
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.equal(JSON.parse(result.stdout).decision, 'HOLD')
  assert.match(docs, /GO_FOR_ONE_AGENCY_PILOT/)
})
