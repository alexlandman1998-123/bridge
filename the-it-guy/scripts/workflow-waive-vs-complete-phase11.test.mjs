#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  buildWorkflowActionWaiverSeparationBlockers,
} from '../server/services/workflowActionPayloadPolicyService.js'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const actionPolicySource = readProjectFile('server/services/workflowActionPayloadPolicyService.js')
const actionServiceSource = readProjectFile('server/services/workflowActionService.js')
const overrideServiceSource = readProjectFile('server/services/workflowOverrideService.js')
const workflowActionTestSource = readProjectFile('server/tests/workflowActionService.test.js')
const workflowOverrideTestSource = readProjectFile('server/tests/workflowOverrideService.test.js')
const salesLaneSource = readProjectFile('src/components/SalesWorkflowLane.jsx')
const financeLaneSource = readProjectFile('src/components/FinanceWorkflowLane.jsx')
const transferLaneSource = readProjectFile('src/components/TransferWorkflowLane.jsx')
const packageJson = readProjectFile('package.json')

assert.deepEqual(
  buildWorkflowActionWaiverSeparationBlockers(
    {
      actionKey: 'RECORD_PAPER_SIGNED_OTP',
      workflowKey: 'sales_otp',
      stepKey: 'signed_otp_received',
      ownerRole: 'agent',
    },
    { completionMode: 'waived' },
  ).map((blocker) => blocker.code),
  ['WORKFLOW_ACTION_WAIVER_REQUIRES_OVERRIDE'],
)

assert.match(
  actionPolicySource,
  /WORKFLOW_ACTION_WAIVER_REQUIRES_OVERRIDE[\s\S]*manual override waiver path/,
  'Workflow action policy should block waiver completion through normal workflow actions.',
)
assert.match(
  actionServiceSource,
  /buildWorkflowActionWaiverSeparationBlockers[\s\S]*waiverSeparationBlockers[\s\S]*return waiverSeparationBlockers/,
  'Workflow action service should enforce waiver/completion separation.',
)
assert.match(
  overrideServiceSource,
  /if \(normalized === 'force_waive' \|\| normalized === 'force_not_applicable'\) return 'step_waived'/,
  'Waiver overrides should use a waiver-specific audit reason code.',
)
assert.match(
  overrideServiceSource,
  /const overrideIntent = buildOverrideIntent\(normalizedOverrideType\)[\s\S]*overrideIntent,/,
  'Waiver override payloads should carry explicit override intent metadata.',
)
assert.match(
  overrideServiceSource,
  /const overrideCompletionMode = buildOverrideCompletionMode\(normalizedOverrideType\)[\s\S]*completionMode:\s*overrideCompletionMode/,
  'Waiver override payloads should carry explicit completion mode metadata.',
)
assert.match(
  overrideServiceSource,
  /waiver:\s*overrideIntent === 'waiver_override'/,
  'Waiver override payloads should carry a waiver boolean marker.',
)

assert.match(
  workflowActionTestSource,
  /completionMode:\s*'waived'[\s\S]*WORKFLOW_ACTION_WAIVER_REQUIRES_OVERRIDE/,
  'Workflow action tests should prove waived completion modes are blocked.',
)
assert.match(
  workflowOverrideTestSource,
  /overrideType:\s*'force_waive'[\s\S]*reason_code,\s*'step_waived'[\s\S]*overrideIntent,\s*'waiver_override'/,
  'Workflow override tests should prove waiver overrides audit as waivers.',
)

for (const [label, source] of [
  ['SalesWorkflowLane', salesLaneSource],
  ['FinanceWorkflowLane', financeLaneSource],
  ['TransferWorkflowLane', transferLaneSource],
]) {
  assert.match(source, /not_applicable:\s*\{[\s\S]*label:\s*'Waived'/, `${label} should label not_applicable steps as waived, not complete.`)
}

assert.match(
  packageJson,
  /"test:workflow-waive-vs-complete-phase11":\s*"node scripts\/workflow-waive-vs-complete-phase11\.test\.mjs"/,
  'package.json should expose the Phase 11 waive-vs-complete regression test.',
)

console.log('workflow waive vs complete Phase 11 tests passed')
