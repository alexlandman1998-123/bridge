#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS,
  createAttorneyWorkflowPhase3Report,
  summarizeAttorneyWorkflowPhase3Report,
} from './attorney-workflow-phase3-launch-gate.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const gateScripts = ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS.map((step) => step.scriptPath)
const gateKeys = ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS.map((step) => step.key)

for (const expectedScript of [
  'scripts/attorney-workflow-contract-phase0.test.mjs',
  'scripts/attorney-workflow-phase1-queue-actions.test.mjs',
  'scripts/attorney-workflow-phase2-permission-lock.test.mjs',
  'scripts/verify-attorney-workflow-resolvers.mjs',
  'scripts/verify-attorney-workflow-lanes.mjs',
  'scripts/verify-attorney-readiness.mjs',
  'scripts/verify-attorney-document-requirements.mjs',
  'scripts/legal-scenario-matrix.test.mjs',
  'scripts/legal-requirement-cardinality-phase2.test.mjs',
  'scripts/finance-tab-launch-readiness.test.mjs',
]) {
  assert.equal(gateScripts.includes(expectedScript), true, `Phase 3 aggregate gate should include ${expectedScript}`)
}

assert.equal(new Set(gateKeys).size, gateKeys.length, 'Phase 3 gate keys should be unique.')
assert.equal(gateKeys.at(-1), 'finance_tab_launch_readiness', 'Finance readiness should be the final aggregate prerequisite.')
assert.equal(ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS.every((step) => step.coverage && step.label), true, 'Every gate step should describe its coverage.')

const passingReport = createAttorneyWorkflowPhase3Report()
passingReport.commands = ATTORNEY_WORKFLOW_PHASE3_GATE_STEPS.map((step) => ({ ...step, status: 'PASS', exitCode: 0 }))
summarizeAttorneyWorkflowPhase3Report(passingReport)
assert.equal(passingReport.summary.status, 'READY', 'All passing commands should make the Phase 3 gate ready.')
assert.equal(passingReport.summary.recommendation, 'GO TO PHASE 4 WITH ATTORNEY AGGREGATE GATE GREEN')

const blockedReport = createAttorneyWorkflowPhase3Report()
blockedReport.commands = [
  { key: 'phase0_contract', status: 'PASS', exitCode: 0 },
  { key: 'finance_tab_launch_readiness', status: 'BLOCKED', exitCode: 1 },
]
summarizeAttorneyWorkflowPhase3Report(blockedReport)
assert.equal(blockedReport.summary.status, 'BLOCKED', 'A failed finance gate should block aggregate readiness.')

const packageSource = read('package.json')
assert.match(packageSource, /"test:attorney-workflow-phase3-launch-gate":\s*"node scripts\/attorney-workflow-phase3-launch-gate\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase3-launch-gate":\s*"node scripts\/attorney-workflow-phase3-launch-gate\.mjs"/)

const phase0Audit = read('docs/audits/attorney-workflow-contract-phase0.md')
assert.match(phase0Audit, /Attorney workflow Phase 3 aggregate launch gate/)
assert.match(phase0Audit, /\| B-ATTY-0-1 \| Closed \| Attorney UX \| Attorney queue row\/bulk actions are wired, routed, or hidden\. \| Phase 1 \|/)
assert.match(phase0Audit, /\| B-ATTY-0-3 \| Closed \| QA \/ Release \| Aggregate launch gate includes the finance readiness direct Node gate\. \| Phase 3 \|/)

const phase2Audit = read('docs/audits/attorney-workflow-phase2-permission-lock.md')
assert.match(phase2Audit, /Phase 3 aggregate launch gate is implemented/)

const phase3Audit = read('docs/audits/attorney-workflow-phase3-launch-gate.md')
assert.match(phase3Audit, /# Attorney Workflow Phase 3 Launch Gate/)
assert.match(phase3Audit, /Decision: GO TO PHASE 4 WITH ATTORNEY AGGREGATE GATE GREEN/)
assert.match(phase3Audit, /npm run verify:attorney-workflow-phase3-launch-gate/)

const launchReadiness = read('docs/phase-8-launch-readiness.md')
assert.match(launchReadiness, /Attorney workflow Phase 3 launch gate: `docs\/audits\/attorney-workflow-phase3-launch-gate\.md`/)
assert.match(launchReadiness, /npm run verify:attorney-workflow-phase3-launch-gate/)

console.log('attorney workflow Phase 3 launch gate tests passed')
