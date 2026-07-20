#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase27/controlled-pilot-preflight.json', 'utf8'))
const operator = readFileSync('scripts/phase27-controlled-pilot-cohort.mjs', 'utf8')
const workflow = readFileSync('.github/workflows/phase27-controlled-pilot-cohort-gate.yml', 'utf8')

assert.equal(evidence.status, 'BLOCKED_PENDING_GENUINE_N4_EVIDENCE')
assert.equal(evidence.phase, 27)
assert.equal(evidence.productionProjectRef, 'isdowlnollckzvltkasn')
assert.equal(evidence.cohort.organisationId, 'ec19d0a6-bcba-4eef-aa72-9972de88204d')
assert.equal(evidence.cohort.organisationName, 'Kingstons Real Estate')
assert.equal(evidence.cohort.organisationCount, 1)
assert.equal(evidence.cohort.activeMembers, 7)
assert.equal(evidence.cohort.activeAdmins, 2)
assert.equal(evidence.cohort.documentPackets, 5)
assert.equal(evidence.n4.ready, false)
assert.equal(evidence.n4.eventCount, 2)
assert.deepEqual(evidence.n4.blockerCodes.sort(), [
  'N4_AUDIENCE_COVERAGE_MISSING',
  'N4_DOCUMENT_COVERAGE_MISSING',
  'N4_SURFACE_COVERAGE_MISSING',
  'N4_VIEWPORT_COVERAGE_MISSING',
].sort())
assert.equal(evidence.productionMutation.n6ControlCreated, false)
assert.equal(evidence.productionMutation.vercelEnforcementConfigured, false)
assert.equal(evidence.productionMutation.productionRedeployed, false)
assert.equal(evidence.safety.syntheticTelemetryCreated, false)
assert.equal(evidence.safety.phase0MigrationFreezeRemainsActive, true)

for (const token of [
  'PHASE27_PILOT_WRITE',
  'bridge_set_document_experience_rollout_n6',
  'bridge_document_experience_runtime_access_n6',
  'BLOCKED_PENDING_GENUINE_N4_EVIDENCE',
  'VITE_DOCUMENT_EXPERIENCE_ROLLOUT_MODE',
  'p_expected_revision',
]) assert.match(operator, new RegExp(token))
assert.match(workflow, /application:phase27:verify/)

console.log('Phase 27 gate passed: the exact cohort is locked and activation remains fail-closed on genuine N4 evidence.')
