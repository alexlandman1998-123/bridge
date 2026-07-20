#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const operator = readFileSync('scripts/phase28-pilot-operations.mjs', 'utf8')
const evidence = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase28/pilot-execution.json', 'utf8'))
const workflow = readFileSync('.github/workflows/phase28-pilot-execution-gate.yml', 'utf8')

for (const token of [
  'PHASE28_PILOT_START',
  'PHASE28_PILOT_STOP',
  'bridge_set_document_experience_rollout_n6',
  'bridge_document_experience_runtime_access_n6',
  'BLOCKED_PENDING_GENUINE_N4_EVIDENCE',
  'PILOT_ACTIVE',
  'PILOT_STOPPED_FAIL_CLOSED',
]) assert.match(operator, new RegExp(token))

assert.equal(evidence.phase, 28)
assert.equal(evidence.status, 'BLOCKED_PENDING_GENUINE_N4_EVIDENCE')
assert.equal(evidence.productionProjectRef, 'isdowlnollckzvltkasn')
assert.equal(evidence.cohort.organisationId, 'ec19d0a6-bcba-4eef-aa72-9972de88204d')
assert.equal(evidence.execution.n6ControlCreated, false)
assert.equal(evidence.execution.vercelEnforcementConfigured, false)
assert.equal(evidence.execution.productionRedeployed, false)
assert.equal(evidence.safety.syntheticTelemetryCreated, false)
assert.equal(evidence.safety.productionDataMutated, false)
assert.match(workflow, /application:phase28:verify/)
assert.match(workflow, /npm ci --ignore-scripts/)

const invalid = spawnSync(process.execPath, ['scripts/phase28-pilot-operations.mjs', '--action=status'], { encoding: 'utf8' })
assert.equal(invalid.error, undefined)
assert.equal(invalid.signal, null)
assert.equal(invalid.stderr, '', 'The fail-closed probe must not fail during module loading.')
assert.equal(invalid.status, 2)
const invalidReport = JSON.parse(invalid.stdout)
assert.equal(invalidReport.status, 'BLOCKED')
assert.ok(invalidReport.blockers.some((row) => row.code === 'PHASE28_PROJECT_MISMATCH'))
assert.ok(invalidReport.blockers.some((row) => row.code === 'PHASE28_SERVICE_ROLE_MISSING'))

console.log('Phase 28 gate passed: pilot execution is observable, bounded, and fail-closed.')
