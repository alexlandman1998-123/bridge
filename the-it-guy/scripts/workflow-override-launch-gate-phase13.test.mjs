#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS,
  createWorkflowOverridePhase13Report,
  summarizeWorkflowOverridePhase13Report,
} from './workflow-override-launch-gate-phase13.mjs'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const gateScripts = WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS.map((step) => step.scriptPath)
const gateKeys = WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS.map((step) => step.key)

for (const expectedScript of [
  'scripts/workflow-override-contract-phase0.test.mjs',
  'scripts/workflow-override-status-normalization-phase1.test.mjs',
  'server/tests/workflowActionService.test.js',
  'server/tests/workflowOverrideService.test.js',
  'scripts/workflow-paper-otp-phase3.test.mjs',
  'scripts/workflow-manual-contract-signing-phase4.test.mjs',
  'scripts/workflow-manual-mandate-phase5.test.mjs',
  'scripts/workflow-agent-assisted-onboarding-phase6.test.mjs',
  'scripts/workflow-agent-assisted-supporting-docs-phase7.test.mjs',
  'scripts/workflow-override-diagnostic-phase8.test.mjs',
  'scripts/workflow-agent-ui-actions-phase9.test.mjs',
  'scripts/workflow-action-payload-policy-phase10.test.mjs',
  'scripts/workflow-waive-vs-complete-phase11.test.mjs',
  'scripts/workflow-override-health-report-phase12.test.mjs',
]) {
  assert.equal(gateScripts.includes(expectedScript), true, `Phase 13 launch gate should include ${expectedScript}`)
}

assert.equal(new Set(gateKeys).size, gateKeys.length, 'Phase 13 gate keys should be unique.')
assert.equal(gateKeys.at(-1), 'phase12_health_report', 'Phase 12 aggregate health report should be the final launch prerequisite.')
assert.equal(
  WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS.every((step) => step.coverage && step.label),
  true,
  'Every Phase 13 gate step should describe its coverage.',
)

const passingReport = createWorkflowOverridePhase13Report()
passingReport.commands = WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS.map((step) => ({
  ...step,
  status: 'PASS',
  exitCode: 0,
}))
summarizeWorkflowOverridePhase13Report(passingReport)
assert.equal(passingReport.summary.status, 'READY')
assert.equal(passingReport.summary.passCount, WORKFLOW_OVERRIDE_PHASE13_GATE_STEPS.length)
assert.equal(passingReport.summary.blockedCount, 0)
assert.equal(passingReport.summary.recommendation, 'GO FOR OVERRIDE OPERATIONAL PILOT')

const blockedReport = createWorkflowOverridePhase13Report()
blockedReport.commands = [
  { key: 'phase11_waive_vs_complete', status: 'PASS', exitCode: 0 },
  { key: 'phase12_health_report', status: 'BLOCKED', exitCode: 1 },
]
summarizeWorkflowOverridePhase13Report(blockedReport)
assert.equal(blockedReport.summary.status, 'BLOCKED')
assert.equal(blockedReport.summary.blockedCount, 1)
assert.match(blockedReport.summary.recommendation, /NO-GO/)

const gateSource = readProjectFile('scripts/workflow-override-launch-gate-phase13.mjs')
const packageJson = readProjectFile('package.json')

assert.match(
  gateSource,
  /GO FOR OVERRIDE OPERATIONAL PILOT/,
  'Phase 13 gate should emit a clear operational pilot recommendation when all checks pass.',
)
assert.match(
  gateSource,
  /runtime_workflow_actions[\s\S]*runtime_workflow_overrides[\s\S]*phase12_health_report/,
  'Phase 13 gate should combine runtime service checks with the Phase 12 aggregate health report.',
)
assert.match(
  packageJson,
  /"test:workflow-override-launch-gate-phase13":\s*"node scripts\/workflow-override-launch-gate-phase13\.test\.mjs"/,
  'package.json should expose the Phase 13 launch gate regression test.',
)
assert.match(
  packageJson,
  /"verify:workflow-override-launch-gate-phase13":\s*"node scripts\/workflow-override-launch-gate-phase13\.mjs"/,
  'package.json should expose the Phase 13 launch gate verifier.',
)

console.log('workflow override launch gate Phase 13 tests passed')
