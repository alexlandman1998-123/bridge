import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  CONVEYANCER_READINESS_CAPABILITY_CATALOGUE,
  CONVEYANCER_READINESS_CHECKS,
  CONVEYANCER_READINESS_FEATURES,
  CONVEYANCER_READINESS_REQUIRED_PILOT_SCENARIOS,
  buildConveyancerReadinessFeatureControls,
  buildConveyancerReadinessPilot,
  buildConveyancerReadinessSnapshot,
  evaluateConveyancerReadinessCapabilities,
  serializeConveyancerReadinessSnapshot,
} from '../conveyancerReadinessBaselineH0.js'

const pilot = () => ({
  pilotId: 'pilot:h0',
  organisationId: 'organisation:h0',
  firmId: 'firm:h0',
  users: { conveyancer: 'user:1', secretary: 'user:2', finance: 'user:3', compliance: 'user:4', firm_admin: 'user:5' },
  matters: CONVEYANCER_READINESS_REQUIRED_PILOT_SCENARIOS.map((scenario, index) => ({ matterId: `matter:${index + 1}`, scenario })),
  startsAt: '2026-07-20T08:00:00.000Z',
  endsAt: '2026-08-20T08:00:00.000Z',
})

const checks = () => CONVEYANCER_READINESS_CHECKS.map((item) => ({ id: item.id, status: 'passed', evidenceReference: `evidence:${item.id}` }))

test('catalogues every P0-P10 and G1-G10 capability with service and test surfaces', () => {
  const result = evaluateConveyancerReadinessCapabilities()
  assert.equal(result.valid, true)
  assert.equal(result.capabilities.length, 21)
  assert.deepEqual(result.capabilities.map((item) => item.id), [
    ...Array.from({ length: 11 }, (_, index) => `P${index}`),
    ...Array.from({ length: 10 }, (_, index) => `G${index + 1}`),
  ])
  assert.equal(result.capabilities.every((item) => item.surfaces.service.length && item.surfaces.tests.length), true)
})

test('traceability references resolve to real source, migration and package test surfaces', () => {
  const root = new URL('../../../..', import.meta.url)
  const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  for (const capability of CONVEYANCER_READINESS_CAPABILITY_CATALOGUE) {
    for (const path of [...capability.surfaces.ui, ...capability.surfaces.service]) assert.equal(existsSync(new URL(path, root)), true, `${capability.id} missing ${path}`)
    for (const command of capability.surfaces.tests) assert.equal(Boolean(packageJson.scripts?.[command]), true, `${capability.id} missing ${command}`)
    for (const record of capability.surfaces.persistence.filter((item) => item.endsWith('.sql'))) assert.equal(existsSync(new URL(`../supabase/migrations/${record}`, root)), true, `${capability.id} missing ${record}`)
  }
})

test('does not advertise test-only capabilities to users', () => {
  assert.equal(CONVEYANCER_READINESS_CAPABILITY_CATALOGUE.filter((item) => item.classification === 'test_only').every((item) => !item.userVisible), true)
  const changed = structuredClone(CONVEYANCER_READINESS_CAPABILITY_CATALOGUE)
  changed.find((item) => item.id === 'G1').userVisible = true
  assert.equal(evaluateConveyancerReadinessCapabilities(changed).findings.includes('test_only_visibility_forbidden:G1'), true)
})

test('requires all four surfaces, evidence and ownership before a capability can be live', () => {
  const changed = structuredClone(CONVEYANCER_READINESS_CAPABILITY_CATALOGUE)
  const cockpit = changed.find((item) => item.id === 'P3')
  cockpit.classification = 'live'
  cockpit.userVisible = true
  const invalid = evaluateConveyancerReadinessCapabilities(changed)
  assert.equal(invalid.findings.includes('live_evidence_missing:P3'), true)
  assert.equal(invalid.findings.includes('live_owner_missing:P3'), true)
  cockpit.evidenceReferences = ['qa:p3:browser']
  cockpit.owner = 'owner:product'
  assert.equal(evaluateConveyancerReadinessCapabilities(changed).valid, true)
})

test('feature controls fail closed and require exact pilot scope', () => {
  const defaults = buildConveyancerReadinessFeatureControls()
  assert.deepEqual(Object.keys(defaults.controls), CONVEYANCER_READINESS_FEATURES)
  assert.equal(Object.values(defaults.controls).every((item) => item.mode === 'off' && item.enabled === false), true)
  const incomplete = buildConveyancerReadinessFeatureControls({ cockpit: { mode: 'pilot', firmIds: ['firm:h0'] } })
  assert.equal(incomplete.findings.includes('feature_pilot_scope_incomplete:cockpit'), true)
  const scoped = buildConveyancerReadinessFeatureControls({ cockpit: { mode: 'pilot', organisationIds: ['organisation:h0'], firmIds: ['firm:h0'], matterIds: ['matter:1'] } })
  assert.equal(scoped.valid, true)
})

test('pilot contract covers exact users and the eight safe scenarios', () => {
  const result = buildConveyancerReadinessPilot(pilot())
  assert.equal(result.valid, true)
  assert.equal(result.pilot.matters.length, 8)
  assert.equal(result.pilot.controls.realNotificationsAllowed, false)
  assert.equal(result.pilot.controls.realProviderCommandsAllowed, false)
  assert.equal(result.pilot.controls.manualProviderFallbackRequired, true)
  const incomplete = buildConveyancerReadinessPilot({ ...pilot(), matters: pilot().matters.slice(0, 7) })
  assert.equal(incomplete.findings.includes('pilot_scenario_missing:manual_provider_fallback'), true)
})

test('readiness snapshot makes current mobile, lint and migration gaps explicit', () => {
  const current = checks().map((item) => ['mobile_browser', 'lint', 'migration_reconciliation'].includes(item.id) ? { ...item, status: 'blocked', evidenceReference: null } : item)
  const snapshot = buildConveyancerReadinessSnapshot({ snapshotId: 'snapshot:h0:current', environment: 'staging', releaseReference: 'release:h0', generatedAt: '2026-07-16T12:00:00.000Z', generatedBy: 'system:h0', pilot: pilot(), checks: current })
  assert.equal(snapshot.decision, 'blocked')
  assert.equal(snapshot.blockers.includes('check_blocked:mobile_browser'), true)
  assert.equal(snapshot.blockers.includes('check_blocked:lint'), true)
  assert.equal(snapshot.blockers.includes('check_blocked:migration_reconciliation'), true)
})

test('clean evidence produces the H1 entry decision without activating anything', () => {
  const snapshot = buildConveyancerReadinessSnapshot({ snapshotId: 'snapshot:h0:ready', environment: 'staging', releaseReference: 'release:h0', generatedAt: '2026-07-16T12:00:00.000Z', generatedBy: 'system:h0', pilot: pilot(), checks: checks() })
  assert.equal(snapshot.decision, 'ready_for_h1')
  assert.deepEqual(snapshot.blockers, [])
  assert.equal(snapshot.controls.databaseWritesPerformed, false)
  assert.equal(snapshot.controls.featureActivationPerformed, false)
  assert.equal(snapshot.controls.deploymentPerformed, false)
})

test('serialized evidence is compact and excludes user identities and secrets', () => {
  const snapshot = buildConveyancerReadinessSnapshot({ snapshotId: 'snapshot:h0:ready', environment: 'staging', releaseReference: 'release:h0', generatedAt: '2026-07-16T12:00:00.000Z', generatedBy: 'system:h0', pilot: pilot(), checks: checks() })
  const serialized = serializeConveyancerReadinessSnapshot(snapshot)
  assert.equal(serialized.includes('user:1'), false)
  assert.equal(serialized.includes('ready_for_h1'), true)
  assert.equal(serializeConveyancerReadinessSnapshot({ apiKey: 'SECRET' }).includes('SECRET'), false)
})

console.log('H0 conveyancer readiness baseline tests passed.')
